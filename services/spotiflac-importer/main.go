package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	spot "github.com/afkarxyz/SpotiFLAC/backend"
)

var (
	pocketbase = strings.TrimRight(env("POCKETBASE_URL", "http://pocketbase:8090"), "/")
	port       = env("PORT", "8787")
	client     = &http.Client{Timeout: 30 * time.Minute}
	jobs       sync.Map
)

type likedTrackRequest struct {
	URL     string `json:"url"`
	AddedAt string `json:"added_at"`
}
type importRequest struct {
	URL           string              `json:"url"`
	Tracks        []likedTrackRequest `json:"tracks"`
	SpotifyUserID string              `json:"spotify_user_id"`
}
type jobControl struct{ cancel context.CancelFunc }

type track struct {
	SpotifyID, Name, Artists, AlbumName, AlbumArtist, Cover, ReleaseDate string
	AlbumID, ArtistID, UPC, Copyright, Publisher, Composer               string
	DurationMS, TrackNumber, DiscNumber, TotalTracks, TotalDiscs         int
	Explicit                                                             bool
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
func bearer(r *http.Request) string {
	return strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
}

func jsonOut(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func pbRequest(method, path, token string, payload any) (map[string]any, error) {
	var body io.Reader
	if payload != nil {
		data, _ := json.Marshal(payload)
		body = bytes.NewReader(data)
	}
	req, err := http.NewRequest(method, pocketbase+path, body)
	if err != nil {
		return nil, err
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	var result map[string]any
	_ = json.Unmarshal(data, &result)
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("PocketBase %d: %s", resp.StatusCode, strings.TrimSpace(string(data)))
	}
	return result, nil
}

func authenticate(token string) (string, error) {
	if token == "" {
		return "", errors.New("missing bearer token")
	}
	data, err := pbRequest("POST", "/api/collections/users/auth-refresh", token, nil)
	if err != nil {
		return "", err
	}
	record, _ := data["record"].(map[string]any)
	id, _ := record["id"].(string)
	if id == "" {
		return "", errors.New("invalid user")
	}
	return id, nil
}

func parseSpotifyURL(raw string) (string, string, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || !strings.EqualFold(u.Hostname(), "open.spotify.com") {
		return "", "", errors.New("use an open.spotify.com track, album or playlist link")
	}
	parts := strings.Split(strings.Trim(u.Path, "/"), "/")
	if len(parts) < 2 || (parts[0] != "track" && parts[0] != "album" && parts[0] != "playlist") || parts[1] == "" {
		return "", "", errors.New("unsupported Spotify link")
	}
	return parts[0], parts[1], nil
}

func handleImports(w http.ResponseWriter, r *http.Request) {
	token := bearer(r)
	owner, err := authenticate(token)
	if err != nil {
		jsonOut(w, 401, map[string]string{"error": err.Error()})
		return
	}
	if r.Method == "GET" {
		path := "/api/collections/music_import_jobs/records?sort=-created&perPage=50&filter=" + url.QueryEscape("owner='"+owner+"'")
		data, err := pbRequest("GET", path, token, nil)
		if err != nil {
			jsonOut(w, 502, map[string]string{"error": err.Error()})
			return
		}
		jsonOut(w, 200, data)
		return
	}
	if r.Method != "POST" {
		jsonOut(w, 405, map[string]string{"error": "method not allowed"})
		return
	}
	var input importRequest
	if json.NewDecoder(io.LimitReader(r.Body, 4<<20)).Decode(&input) != nil {
		jsonOut(w, 400, map[string]string{"error": "invalid JSON"})
		return
	}
	kind := ""
	if len(input.Tracks) > 0 {
		kind = "playlist"
		input.URL = "spotify:liked"
		if len(input.Tracks) > 10000 {
			jsonOut(w, 400, map[string]string{"error": "Spotify library exceeds the 10,000 track import limit"})
			return
		}
	} else {
		kind, _, err = parseSpotifyURL(input.URL)
		if err != nil {
			jsonOut(w, 400, map[string]string{"error": err.Error()})
			return
		}
	}
	record, err := pbRequest("POST", "/api/collections/music_import_jobs/records", token, map[string]any{
		"owner": owner, "source_url": input.URL, "source_type": kind, "title": "Spotify import", "status": "queued", "total": len(input.Tracks), "completed": 0, "failed": 0, "items": []any{}, "track_ids": []any{}, "like_after_import": len(input.Tracks) > 0, "spotify_user_id": input.SpotifyUserID,
	})
	if err != nil {
		jsonOut(w, 502, map[string]string{"error": err.Error()})
		return
	}
	jobID, _ := record["id"].(string)
	ctx, cancel := context.WithCancel(context.Background())
	jobs.Store(jobID, jobControl{cancel: cancel})
	if len(input.Tracks) > 0 {
		go runLikedImport(ctx, token, owner, jobID, input.Tracks)
	} else {
		go runImport(ctx, token, owner, jobID, input.URL, kind)
	}
	jsonOut(w, 202, record)
}

func runLikedImport(ctx context.Context, token, owner, jobID string, requested []likedTrackRequest) {
	defer jobs.Delete(jobID)
	updateJob(token, jobID, map[string]any{"status": "downloading", "title": "Liked Songs from Spotify", "total": len(requested)})
	items := make([]map[string]any, 0, len(requested))
	trackIDs := make([]string, 0, len(requested))
	failed := 0
	for index, request := range requested {
		if ctx.Err() != nil {
			updateJob(token, jobID, map[string]any{"status": "cancelled", "items": items, "track_ids": trackIDs})
			return
		}
		_, spotifyID, parseErr := parseSpotifyURL(request.URL)
		if parseErr != nil {
			failed++
			items = append(items, map[string]any{"status": "failed", "error": parseErr.Error(), "added_at": request.AddedAt})
			continue
		}
		metadata, metaErr := spot.GetFilteredSpotifyData(ctx, "https://open.spotify.com/track/"+spotifyID, false, 0, ", ", nil)
		_, list, normalizeErr := normalizeMetadata(metadata, "track")
		if metaErr != nil || normalizeErr != nil || len(list) == 0 {
			failed++
			message := "Spotify metadata unavailable"
			if metaErr != nil {
				message = metaErr.Error()
			}
			items = append(items, map[string]any{"spotify_id": spotifyID, "status": "failed", "error": message, "added_at": request.AddedAt})
			continue
		}
		item := list[0]
		updateJob(token, jobID, map[string]any{"current_track": item.Name, "completed": len(trackIDs), "failed": failed})
		recordID, provider, importErr := importTrack(ctx, token, owner, item, index+1)
		state := map[string]any{"spotify_id": item.SpotifyID, "title": item.Name, "artist": item.Artists, "status": "completed", "record_id": recordID, "provider": provider, "added_at": request.AddedAt}
		if importErr != nil {
			failed++
			state["status"] = "failed"
			state["error"] = importErr.Error()
		} else {
			trackIDs = append(trackIDs, recordID)
		}
		items = append(items, state)
		updateJob(token, jobID, map[string]any{"items": items, "track_ids": trackIDs, "completed": len(trackIDs), "failed": failed})
	}
	status := "completed"
	if failed > 0 && len(trackIDs) > 0 {
		status = "partial"
	}
	if len(trackIDs) == 0 {
		status = "failed"
	}
	updateJob(token, jobID, map[string]any{"status": status, "completed": len(trackIDs), "failed": failed, "current_track": ""})
}

func handleJob(w http.ResponseWriter, r *http.Request) {
	token := bearer(r)
	owner, err := authenticate(token)
	if err != nil {
		jsonOut(w, 401, map[string]string{"error": err.Error()})
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/api/selfhost/imports/")
	cancel := strings.HasSuffix(id, "/cancel")
	id = strings.TrimSuffix(id, "/cancel")
	data, err := pbRequest("GET", "/api/collections/music_import_jobs/records/"+url.PathEscape(id), token, nil)
	if err != nil || data["owner"] != owner {
		jsonOut(w, 404, map[string]string{"error": "job not found"})
		return
	}
	if cancel && r.Method == "POST" {
		if value, ok := jobs.Load(id); ok {
			value.(jobControl).cancel()
		}
		_, _ = pbRequest("PATCH", "/api/collections/music_import_jobs/records/"+id, token, map[string]any{"status": "cancelled"})
		jsonOut(w, 200, map[string]bool{"cancelled": true})
		return
	}
	jsonOut(w, 200, data)
}

func updateJob(token, id string, patch map[string]any) {
	_, _ = pbRequest("PATCH", "/api/collections/music_import_jobs/records/"+id, token, patch)
}

func runImport(ctx context.Context, token, owner, jobID, sourceURL, kind string) {
	defer jobs.Delete(jobID)
	updateJob(token, jobID, map[string]any{"status": "resolving"})
	meta, err := spot.GetFilteredSpotifyData(ctx, sourceURL, true, 250*time.Millisecond, ", ", nil)
	if err != nil {
		updateJob(token, jobID, map[string]any{"status": "failed", "error": err.Error()})
		return
	}
	info, list, err := normalizeMetadata(meta, kind)
	if err != nil || len(list) == 0 {
		if err == nil {
			err = errors.New("Spotify returned no tracks")
		}
		updateJob(token, jobID, map[string]any{"status": "failed", "error": err.Error()})
		return
	}
	updateJob(token, jobID, map[string]any{"status": "downloading", "title": info["title"], "description": info["description"], "cover": info["cover"], "total": len(list)})

	items := make([]map[string]any, 0, len(list))
	trackIDs := make([]string, 0, len(list))
	failed := 0
	for index, item := range list {
		if ctx.Err() != nil {
			updateJob(token, jobID, map[string]any{"status": "cancelled", "items": items, "track_ids": trackIDs})
			return
		}
		updateJob(token, jobID, map[string]any{"current_track": item.Name, "completed": len(trackIDs), "failed": failed})
		recordID, provider, err := importTrack(ctx, token, owner, item, index+1)
		state := map[string]any{"spotify_id": item.SpotifyID, "title": item.Name, "artist": item.Artists, "status": "completed", "record_id": recordID, "provider": provider}
		if err != nil {
			failed++
			state["status"] = "failed"
			state["error"] = err.Error()
		} else {
			trackIDs = append(trackIDs, recordID)
		}
		items = append(items, state)
		updateJob(token, jobID, map[string]any{"items": items, "track_ids": trackIDs, "completed": len(trackIDs), "failed": failed})
	}
	status := "completed"
	if failed > 0 && len(trackIDs) > 0 {
		status = "partial"
	}
	if len(trackIDs) == 0 {
		status = "failed"
	}
	updateJob(token, jobID, map[string]any{"status": status, "completed": len(trackIDs), "failed": failed, "current_track": ""})
}

func normalizeMetadata(value any, kind string) (map[string]string, []track, error) {
	data, _ := json.Marshal(value)
	var root map[string]any
	if json.Unmarshal(data, &root) != nil {
		return nil, nil, errors.New("invalid Spotify metadata")
	}
	info := map[string]string{"title": "Spotify import"}
	var rows []any
	if kind == "track" {
		if one, ok := root["track"].(map[string]any); ok {
			rows = []any{one}
			info["title"] = stringValue(one, "name")
			info["cover"] = stringValue(one, "images")
		}
	}
	if kind == "album" {
		rows, _ = root["track_list"].([]any)
		if album, ok := root["album_info"].(map[string]any); ok {
			info["title"] = stringValue(album, "name")
			info["cover"] = stringValue(album, "images")
		}
	}
	if kind == "playlist" {
		rows, _ = root["track_list"].([]any)
		if playlist, ok := root["playlist_info"].(map[string]any); ok {
			info["cover"] = stringValue(playlist, "cover")
			info["description"] = stringValue(playlist, "description")
			if owner, ok := playlist["owner"].(map[string]any); ok {
				info["title"] = stringValue(owner, "name")
			}
		}
	}
	result := make([]track, 0, len(rows))
	for _, row := range rows {
		if item, ok := row.(map[string]any); ok {
			result = append(result, decodeTrack(item))
		}
	}
	return info, result, nil
}

func stringValue(m map[string]any, key string) string { value, _ := m[key].(string); return value }
func intValue(m map[string]any, key string) int       { value, _ := m[key].(float64); return int(value) }
func pocketbaseDate(value string) string {
	value = strings.TrimSpace(value)
	if len(value) == 4 {
		return value + "-01-01"
	}
	if len(value) == 7 {
		return value + "-01"
	}
	if len(value) >= 10 {
		return value[:10]
	}
	return ""
}
func decodeTrack(m map[string]any) track {
	return track{
		SpotifyID: stringValue(m, "spotify_id"), Name: stringValue(m, "name"), Artists: stringValue(m, "artists"), AlbumName: stringValue(m, "album_name"), AlbumArtist: stringValue(m, "album_artist"), Cover: stringValue(m, "images"), ReleaseDate: stringValue(m, "release_date"), AlbumID: stringValue(m, "album_id"), ArtistID: stringValue(m, "artist_id"), UPC: stringValue(m, "upc"), Copyright: stringValue(m, "copyright"), Publisher: stringValue(m, "publisher"), Composer: stringValue(m, "composer"), DurationMS: intValue(m, "duration_ms"), TrackNumber: intValue(m, "track_number"), DiscNumber: intValue(m, "disc_number"), TotalTracks: intValue(m, "total_tracks"), TotalDiscs: intValue(m, "total_discs"), Explicit: m["is_explicit"] == true,
	}
}

func findExisting(token, owner, spotifyID string) string {
	filter := url.QueryEscape("owner='" + owner + "' && spotify_id='" + spotifyID + "'")
	data, err := pbRequest("GET", "/api/collections/music_tracks/records?perPage=1&filter="+filter, token, nil)
	if err != nil {
		return ""
	}
	items, _ := data["items"].([]any)
	if len(items) > 0 {
		if item, ok := items[0].(map[string]any); ok {
			id, _ := item["id"].(string)
			return id
		}
	}
	return ""
}

func importTrack(ctx context.Context, token, owner string, item track, position int) (string, string, error) {
	if existing := findExisting(token, owner, item.SpotifyID); existing != "" {
		return existing, "existing", nil
	}
	dir, err := os.MkdirTemp("", "monochrome-spotiflac-")
	if err != nil {
		return "", "", err
	}
	defer os.RemoveAll(dir)
	isrc := spot.ResolveTrackISRC(item.SpotifyID)
	spotifyURL := "https://open.spotify.com/track/" + item.SpotifyID
	file, provider, err := downloadHeadlessTrack(ctx, spotifyURL, dir)
	if err != nil {
		return "", provider, err
	}
	lyrics := fetchTTML(item)
	artistID, albumID := upsertCatalog(token, owner, item)
	record, err := uploadTrack(token, owner, item, isrc, provider, lyrics, file, artistID, albumID)
	if err != nil {
		return "", provider, err
	}
	id, _ := record["id"].(string)
	return id, provider, nil
}

func downloadHeadlessTrack(ctx context.Context, spotifyURL, outputDir string) (string, string, error) {
	command := exec.CommandContext(ctx, "python", "/app/launcher.py", spotifyURL, outputDir,
		"--service", "qobuz", "deezer", "--quality", "LOSSLESS", "--timeout", "180", "--no-lyrics", "--no-extensions-fallback")
	output, commandErr := command.CombinedOutput()
	file, fileErr := findDownloadedFLAC(outputDir)
	provider := headlessProvider(output)
	if commandErr != nil || fileErr != nil {
		message := strings.TrimSpace(string(output))
		if len(message) > 4000 {
			message = message[len(message)-4000:]
		}
		if commandErr != nil {
			return "", provider, fmt.Errorf("headless downloader failed: %w: %s", commandErr, message)
		}
		return "", provider, fmt.Errorf("headless downloader produced no FLAC: %w: %s", fileErr, message)
	}
	return file, provider, nil
}

func findDownloadedFLAC(root string) (string, error) {
	var result string
	err := filepath.Walk(root, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if !info.IsDir() && strings.EqualFold(filepath.Ext(path), ".flac") && info.Size() > 0 {
			result = path
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	if result == "" {
		return "", errors.New("FLAC file not found")
	}
	return result, nil
}

func headlessProvider(output []byte) string {
	upper := strings.ToUpper(string(output))
	if strings.Contains(upper, "SOURCE] QOBUZ") {
		return "qobuz"
	}
	if strings.Contains(upper, "SOURCE] DEEZER") {
		return "deezer"
	}
	return "spotiflac-headless"
}

func fetchTTML(item track) string {
	lyrics, _, err := spot.NewLyricsClient().FetchLyricsAllSources(item.SpotifyID, item.Name, item.Artists, item.AlbumName, item.DurationMS/1000)
	if err != nil || lyrics == nil || len(lyrics.Lines) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?><tt xmlns="http://www.w3.org/ns/ttml"><body><div>`)
	for index, line := range lyrics.Lines {
		start, _ := strconv.ParseInt(line.StartTimeMs, 10, 64)
		end := int64(item.DurationMS)
		if index+1 < len(lyrics.Lines) {
			if next, e := strconv.ParseInt(lyrics.Lines[index+1].StartTimeMs, 10, 64); e == nil && next > start {
				end = next
			}
		}
		fmt.Fprintf(&b, `<p begin="%.3fs" end="%.3fs">%s</p>`, float64(start)/1000, float64(end)/1000, xmlEscape(line.Words))
	}
	b.WriteString(`</div></body></tt>`)
	return b.String()
}

func xmlEscape(value string) string {
	value = strings.ReplaceAll(value, "&", "&amp;")
	value = strings.ReplaceAll(value, "<", "&lt;")
	value = strings.ReplaceAll(value, ">", "&gt;")
	return value
}

func findCatalogRecord(token, collection, owner, spotifyID string) string {
	if spotifyID == "" {
		return ""
	}
	filter := url.QueryEscape("owner='" + owner + "' && spotify_id='" + spotifyID + "'")
	data, err := pbRequest("GET", "/api/collections/"+collection+"/records?perPage=1&filter="+filter, token, nil)
	if err != nil {
		return ""
	}
	items, _ := data["items"].([]any)
	if len(items) > 0 {
		if row, ok := items[0].(map[string]any); ok {
			id, _ := row["id"].(string)
			return id
		}
	}
	return ""
}

func upsertCatalog(token, owner string, item track) (string, string) {
	artistSpotifyID := item.ArtistID
	if artistSpotifyID == "" {
		artistSpotifyID = "name-" + strings.ToLower(strings.ReplaceAll(item.Artists, " ", "-"))
	}
	artistID := findCatalogRecord(token, "music_artists", owner, artistSpotifyID)
	if artistID == "" {
		record, err := pbRequest("POST", "/api/collections/music_artists/records", token, map[string]any{"owner": owner, "spotify_id": artistSpotifyID, "name": item.Artists, "image": item.Cover, "spotify_url": "https://open.spotify.com/artist/" + item.ArtistID, "genres": []string{}})
		if err == nil {
			artistID, _ = record["id"].(string)
		}
	}
	albumSpotifyID := item.AlbumID
	if albumSpotifyID == "" {
		albumSpotifyID = "album-" + strings.ToLower(strings.ReplaceAll(item.AlbumArtist+"-"+item.AlbumName, " ", "-"))
	}
	albumID := findCatalogRecord(token, "music_albums", owner, albumSpotifyID)
	if albumID == "" {
		record, err := pbRequest("POST", "/api/collections/music_albums/records", token, map[string]any{"owner": owner, "spotify_id": albumSpotifyID, "title": item.AlbumName, "artists": []string{artistID}, "artist_name": item.AlbumArtist, "cover": item.Cover, "spotify_url": "https://open.spotify.com/album/" + item.AlbumID, "upc": item.UPC, "release_date": pocketbaseDate(item.ReleaseDate), "total_tracks": item.TotalTracks, "total_discs": item.TotalDiscs, "label": item.Publisher, "copyright": item.Copyright})
		if err == nil {
			albumID, _ = record["id"].(string)
		}
	}
	return artistID, albumID
}

func uploadTrack(token, owner string, item track, isrc, provider, lyrics, audioPath, artistID, albumID string) (map[string]any, error) {
	temp, err := os.CreateTemp("", "monochrome-pb-upload-")
	if err != nil {
		return nil, err
	}
	defer os.Remove(temp.Name())
	defer temp.Close()
	w := multipart.NewWriter(temp)
	fields := map[string]string{"owner": owner, "title": item.Name, "artist": item.Artists, "album": item.AlbumName, "album_artist": item.AlbumArtist, "release_date": pocketbaseDate(item.ReleaseDate), "duration": fmt.Sprint(float64(item.DurationMS) / 1000), "track_number": fmt.Sprint(item.TrackNumber), "disc_number": fmt.Sprint(item.DiscNumber), "total_tracks": fmt.Sprint(item.TotalTracks), "total_discs": fmt.Sprint(item.TotalDiscs), "explicit": fmt.Sprint(item.Explicit), "spotify_id": item.SpotifyID, "spotify_url": "https://open.spotify.com/track/" + item.SpotifyID, "isrc": isrc, "upc": item.UPC, "composer": item.Composer, "publisher": item.Publisher, "copyright": item.Copyright, "source_provider": provider, "lyrics": lyrics}
	if artistID != "" {
		fields["artists_rel"] = artistID
	}
	if albumID != "" {
		fields["album_rel"] = albumID
	}
	for key, value := range fields {
		_ = w.WriteField(key, value)
	}
	part, err := w.CreateFormFile("audio", filepath.Base(audioPath))
	if err != nil {
		return nil, err
	}
	audio, err := os.Open(audioPath)
	if err != nil {
		return nil, err
	}
	_, err = io.Copy(part, audio)
	audio.Close()
	if err != nil {
		return nil, err
	}
	if item.Cover != "" {
		if resp, e := client.Get(item.Cover); e == nil && resp.StatusCode < 300 {
			cover, _ := w.CreateFormFile("cover", "cover.jpg")
			_, _ = io.Copy(cover, io.LimitReader(resp.Body, 10<<20))
			resp.Body.Close()
		}
	}
	_ = w.Close()
	_, _ = temp.Seek(0, 0)
	req, _ := http.NewRequest("POST", pocketbase+"/api/collections/music_tracks/records", temp)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", w.FormDataContentType())
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	var result map[string]any
	_ = json.Unmarshal(data, &result)
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("track upload %d: %s", resp.StatusCode, string(data))
	}
	return result, nil
}

// stableShareID mirrors the frontend `stableId()` hash so server-rendered
// share documents can resolve album/artist URLs built by the SPA. JS uses
// 32-bit signed integer arithmetic (|0), so the Go port must wrap identically.
func stableShareID(prefix, value string) string {
	var hash int32
	for i := 0; i < len(value); i++ {
		var unit int32
		if value[i] < 0x80 {
			unit = int32(value[i])
		} else {
			r, size := utf8.DecodeRuneInString(value[i:])
			if r != utf8.RuneError {
				unit = int32(r)
				i += size - 1
			} else {
				unit = int32(value[i])
			}
		}
		hash = (hash << 5) - hash + unit
	}
	if hash < 0 {
		hash = -hash
	}
	return fmt.Sprintf("%s-%s", prefix, strconv.FormatInt(int64(hash), 36))
}

// pbList runs a PocketBase list query and returns the raw items.
func pbList(path string) ([]map[string]any, error) {
	data, err := pbRequest("GET", path, "", nil)
	if err != nil {
		return nil, err
	}
	items, _ := data["items"].([]any)
	result := make([]map[string]any, 0, len(items))
	for _, item := range items {
		if row, ok := item.(map[string]any); ok {
			result = append(result, row)
		}
	}
	return result, nil
}

func stringField(row map[string]any, key string) string {
	value, _ := row[key].(string)
	return value
}

func recordCollectionID(row map[string]any, fallback string) string {
	if id := stringField(row, "collectionId"); id != "" {
		return id
	}
	if name := stringField(row, "collectionName"); name != "" {
		return name
	}
	return fallback
}

// resolveShareAlbum finds a music_albums record whose frontend stable ID
// matches the requested selfhost-album-* ID.
func resolveShareAlbum(id string) (map[string]any, error) {
	rows, err := pbList("/api/collections/music_albums/records?perPage=200")
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		title := stringField(row, "title")
		artist := stringField(row, "artist_name")
		if title == "" {
			continue
		}
		if stableShareID("selfhost-album", artist+"|"+title) == id {
			return row, nil
		}
	}
	return nil, errors.New("album not found")
}

// resolveShareArtist finds a music_artists record whose frontend stable ID
// matches the requested selfhost-artist-* ID.
func resolveShareArtist(id string) (map[string]any, error) {
	rows, err := pbList("/api/collections/music_artists/records?perPage=200")
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		name := stringField(row, "name")
		if name == "" {
			continue
		}
		if stableShareID("selfhost-artist", name) == id {
			return row, nil
		}
	}
	return nil, errors.New("artist not found")
}

// fileURL builds an absolute PocketBase file URL for a record + filename.
func fileURL(r *http.Request, collection, recordID, filename string) string {
	if filename == "" || recordID == "" {
		return ""
	}
	if strings.HasPrefix(filename, "http") {
		return filename
	}
	scheme := "http"
	if forwarded := r.Header.Get("X-Forwarded-Proto"); forwarded != "" {
		scheme = strings.TrimSpace(strings.Split(forwarded, ",")[0])
	}
	host := r.Host
	if host == "" {
		host = "localhost"
	}
	return fmt.Sprintf("%s://%s/api/files/%s/%s/%s", scheme, host, collection, recordID, url.PathEscape(filename))
}

func shareCanonicalPath(kind, id string) string {
	switch kind {
	case "userplaylist":
		return "/userplaylist/" + url.PathEscape(id)
	default:
		return "/" + kind + "/" + url.PathEscape(id)
	}
}

func shareLabel(kind string) string {
	switch kind {
	case "track":
		return "Track"
	case "album":
		return "Album"
	case "artist":
		return "Artist"
	case "userplaylist":
		return "Playlist"
	default:
		return "Music"
	}
}

func shareOgType(kind string) string {
	switch kind {
	case "track":
		return "music.song"
	case "album":
		return "music.album"
	case "userplaylist":
		return "music.playlist"
	case "artist":
		return "profile"
	default:
		return "website"
	}
}

func renderShareDocument(w http.ResponseWriter, r *http.Request, kind, id, title, description, image, shareURL string) {
	label := shareLabel(kind)
	canonical := shareCanonicalPath(kind, id)
	siteURL := fmt.Sprintf("%s://%s", func() string {
		if forwarded := r.Header.Get("X-Forwarded-Proto"); forwarded != "" {
			return strings.TrimSpace(strings.Split(forwarded, ",")[0])
		}
		return "http"
	}(), r.Host)
	ogType := shareOgType(kind)
	docTitle := html.EscapeString(title)
	docDesc := html.EscapeString(description)
	docImage := html.EscapeString(image)
	docURL := html.EscapeString(shareURL)
	docCanonical := html.EscapeString(siteURL + canonical)

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=300")
	_, _ = fmt.Fprintf(w, `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>%s · %s</title>
<meta name="robots" content="index, follow" />
<link rel="canonical" href="%s" />
<link rel="icon" href="/assets/logo.svg" type="image/svg+xml" />
<meta property="og:type" content="%s" />
<meta property="og:site_name" content="Monochrome" />
<meta property="og:title" content="%s · %s" />
<meta property="og:description" content="%s" />
<meta property="og:url" content="%s" />
<meta property="og:image" content="%s" />
<meta property="og:image:alt" content="%s" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="@monochrome" />
<meta name="twitter:title" content="%s · %s" />
<meta name="twitter:description" content="%s" />
<meta name="twitter:image" content="%s" />
<meta http-equiv="refresh" content="0;url=%s" />
<script>
    if (location.hash) {
        var path = location.hash.substring(1);
        if (path.startsWith('/')) location.replace(path);
    }
</script>
</head>
<body>
<noscript><a href="%s">Open in Monochrome</a></noscript>
</body>
</html>
`, docTitle, label, docCanonical, ogType, docTitle, label, docDesc, docURL, docImage, docTitle, docTitle, label, docDesc, docImage, docURL, docCanonical)
}

func handleShare(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 || parts[0] != "share" {
		http.NotFound(w, r)
		return
	}
	kind := parts[1]
	id := strings.Join(parts[2:], "/")
	if id == "" {
		http.NotFound(w, r)
		return
	}

	shareURL := fmt.Sprintf("%s://%s%s", func() string {
		if forwarded := r.Header.Get("X-Forwarded-Proto"); forwarded != "" {
			return strings.TrimSpace(strings.Split(forwarded, ",")[0])
		}
		return "http"
	}(), r.Host, r.URL.Path)

	var title, description, image, collection, recordID string

	switch kind {
	case "track":
		row, err := pbRequest("GET", "/api/collections/music_tracks/records/"+url.PathEscape(id), "", nil)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		recordID = id
		collection = recordCollectionID(row, "music_tracks")
		title = stringField(row, "title")
		description = stringField(row, "artist")
		if description == "" {
			description = "Monochrome"
		}
		image = fileURL(r, collection, recordID, stringField(row, "cover"))
	case "album":
		row, err := resolveShareAlbum(id)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		recordID = stringField(row, "id")
		collection = recordCollectionID(row, "music_albums")
		title = stringField(row, "title")
		description = stringField(row, "artist_name")
		if description == "" {
			description = "Album"
		}
		image = fileURL(r, collection, recordID, stringField(row, "cover"))
	case "artist":
		row, err := resolveShareArtist(id)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		recordID = stringField(row, "id")
		collection = recordCollectionID(row, "music_artists")
		title = stringField(row, "name")
		description = "Artist"
		image = fileURL(r, collection, recordID, stringField(row, "image"))
	case "userplaylist":
		rows, err := pbList("/api/collections/public_playlists/records?perPage=1&filter=" + url.QueryEscape("uuid='"+id+"'"))
		if err != nil || len(rows) == 0 {
			http.NotFound(w, r)
			return
		}
		row := rows[0]
		recordID = stringField(row, "id")
		collection = recordCollectionID(row, "public_playlists")
		title = stringField(row, "title")
		if title == "" {
			title = stringField(row, "name")
		}
		description = stringField(row, "description")
		if description == "" {
			description = "Playlist"
		}
		image = fileURL(r, collection, recordID, stringField(row, "image"))
	default:
		http.NotFound(w, r)
		return
	}

	if title == "" {
		title = "Monochrome"
	}
	if image == "" {
		image = fmt.Sprintf("%s://%s/assets/appicon.png", func() string {
			if forwarded := r.Header.Get("X-Forwarded-Proto"); forwarded != "" {
				return strings.TrimSpace(strings.Split(forwarded, ",")[0])
			}
			return "http"
		}(), r.Host)
	}

	renderShareDocument(w, r, kind, id, title, description, image, shareURL)
}

func main() {
	spot.AppVersion = "7.2.0"
	mux := http.NewServeMux()
	mux.HandleFunc("/api/selfhost/imports", handleImports)
	mux.HandleFunc("/api/selfhost/imports/", handleJob)
	mux.HandleFunc("/share/", handleShare)
	health := func(w http.ResponseWriter, _ *http.Request) {
		jsonOut(w, 200, map[string]string{"status": "ok", "engine": "SpotiFLAC Headless 1.5.8"})
	}
	mux.HandleFunc("/health", health)
	mux.HandleFunc("/api/selfhost/health", health)
	server := &http.Server{Addr: ":" + port, Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	log.Printf("Monochrome SpotiFLAC importer listening on :%s", port)
	log.Fatal(server.ListenAndServe())
}
