package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

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
type jobControl struct { cancel context.CancelFunc }

type track struct {
	SpotifyID, Name, Artists, AlbumName, AlbumArtist, Cover, ReleaseDate string
	AlbumID, ArtistID, UPC, Copyright, Publisher, Composer string
	DurationMS, TrackNumber, DiscNumber, TotalTracks, TotalDiscs int
	Explicit bool
}

func env(key, fallback string) string { if value := os.Getenv(key); value != "" { return value }; return fallback }
func bearer(r *http.Request) string { return strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ") }

func jsonOut(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func pbRequest(method, path, token string, payload any) (map[string]any, error) {
	var body io.Reader
	if payload != nil { data, _ := json.Marshal(payload); body = bytes.NewReader(data) }
	req, err := http.NewRequest(method, pocketbase+path, body)
	if err != nil { return nil, err }
	if token != "" { req.Header.Set("Authorization", "Bearer "+token) }
	if payload != nil { req.Header.Set("Content-Type", "application/json") }
	resp, err := client.Do(req)
	if err != nil { return nil, err }
	defer resp.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	var result map[string]any
	_ = json.Unmarshal(data, &result)
	if resp.StatusCode >= 300 { return nil, fmt.Errorf("PocketBase %d: %s", resp.StatusCode, strings.TrimSpace(string(data))) }
	return result, nil
}

func authenticate(token string) (string, error) {
	if token == "" { return "", errors.New("missing bearer token") }
	data, err := pbRequest("POST", "/api/collections/users/auth-refresh", token, nil)
	if err != nil { return "", err }
	record, _ := data["record"].(map[string]any)
	id, _ := record["id"].(string)
	if id == "" { return "", errors.New("invalid user") }
	return id, nil
}

func parseSpotifyURL(raw string) (string, string, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || !strings.EqualFold(u.Hostname(), "open.spotify.com") { return "", "", errors.New("use an open.spotify.com track, album or playlist link") }
	parts := strings.Split(strings.Trim(u.Path, "/"), "/")
	if len(parts) < 2 || (parts[0] != "track" && parts[0] != "album" && parts[0] != "playlist") || parts[1] == "" { return "", "", errors.New("unsupported Spotify link") }
	return parts[0], parts[1], nil
}

func handleImports(w http.ResponseWriter, r *http.Request) {
	token := bearer(r)
	owner, err := authenticate(token)
	if err != nil { jsonOut(w, 401, map[string]string{"error": err.Error()}); return }
	if r.Method == "GET" {
		path := "/api/collections/music_import_jobs/records?sort=-created&perPage=50&filter=" + url.QueryEscape("owner='"+owner+"'")
		data, err := pbRequest("GET", path, token, nil)
		if err != nil { jsonOut(w, 502, map[string]string{"error": err.Error()}); return }
		jsonOut(w, 200, data); return
	}
	if r.Method != "POST" { jsonOut(w, 405, map[string]string{"error":"method not allowed"}); return }
	var input importRequest
	if json.NewDecoder(io.LimitReader(r.Body, 4<<20)).Decode(&input) != nil { jsonOut(w, 400, map[string]string{"error":"invalid JSON"}); return }
	kind := ""
	if len(input.Tracks) > 0 {
		kind = "playlist"
		input.URL = "spotify:liked"
		if len(input.Tracks) > 10000 { jsonOut(w, 400, map[string]string{"error":"Spotify library exceeds the 10,000 track import limit"}); return }
	} else {
		kind, _, err = parseSpotifyURL(input.URL)
		if err != nil { jsonOut(w, 400, map[string]string{"error":err.Error()}); return }
	}
	record, err := pbRequest("POST", "/api/collections/music_import_jobs/records", token, map[string]any{
		"owner":owner, "source_url":input.URL, "source_type":kind, "title":"Spotify import", "status":"queued", "total":len(input.Tracks), "completed":0, "failed":0, "items":[]any{}, "track_ids":[]any{}, "like_after_import":len(input.Tracks)>0, "spotify_user_id":input.SpotifyUserID,
	})
	if err != nil { jsonOut(w, 502, map[string]string{"error":err.Error()}); return }
	jobID, _ := record["id"].(string)
	ctx, cancel := context.WithCancel(context.Background())
	jobs.Store(jobID, jobControl{cancel:cancel})
	if len(input.Tracks) > 0 { go runLikedImport(ctx, token, owner, jobID, input.Tracks) } else { go runImport(ctx, token, owner, jobID, input.URL, kind) }
	jsonOut(w, 202, record)
}

func runLikedImport(ctx context.Context, token, owner, jobID string, requested []likedTrackRequest) {
	defer jobs.Delete(jobID)
	updateJob(token, jobID, map[string]any{"status":"downloading", "title":"Liked Songs from Spotify", "total":len(requested)})
	items := make([]map[string]any, 0, len(requested)); trackIDs := make([]string, 0, len(requested)); failed := 0
	for index, request := range requested {
		if ctx.Err() != nil { updateJob(token, jobID, map[string]any{"status":"cancelled", "items":items, "track_ids":trackIDs}); return }
		_, spotifyID, parseErr := parseSpotifyURL(request.URL)
		if parseErr != nil { failed++; items = append(items,map[string]any{"status":"failed","error":parseErr.Error(),"added_at":request.AddedAt}); continue }
		metadata, metaErr := spot.GetFilteredSpotifyData(ctx, "https://open.spotify.com/track/"+spotifyID, false, 0, ", ", nil)
		_, list, normalizeErr := normalizeMetadata(metadata,"track")
		if metaErr != nil || normalizeErr != nil || len(list) == 0 {
			failed++; message := "Spotify metadata unavailable"; if metaErr != nil { message = metaErr.Error() }; items = append(items,map[string]any{"spotify_id":spotifyID,"status":"failed","error":message,"added_at":request.AddedAt}); continue
		}
		item := list[0]; updateJob(token,jobID,map[string]any{"current_track":item.Name,"completed":len(trackIDs),"failed":failed})
		recordID, provider, importErr := importTrack(ctx,token,owner,item,index+1)
		state := map[string]any{"spotify_id":item.SpotifyID,"title":item.Name,"artist":item.Artists,"status":"completed","record_id":recordID,"provider":provider,"added_at":request.AddedAt}
		if importErr != nil { failed++; state["status"]="failed"; state["error"]=importErr.Error() } else { trackIDs=append(trackIDs,recordID) }
		items=append(items,state); updateJob(token,jobID,map[string]any{"items":items,"track_ids":trackIDs,"completed":len(trackIDs),"failed":failed})
	}
	status := "completed"; if failed > 0 && len(trackIDs)>0 { status="partial" }; if len(trackIDs)==0 { status="failed" }
	updateJob(token,jobID,map[string]any{"status":status,"completed":len(trackIDs),"failed":failed,"current_track":""})
}

func handleJob(w http.ResponseWriter, r *http.Request) {
	token := bearer(r)
	owner, err := authenticate(token)
	if err != nil { jsonOut(w, 401, map[string]string{"error":err.Error()}); return }
	id := strings.TrimPrefix(r.URL.Path, "/api/selfhost/imports/")
	cancel := strings.HasSuffix(id, "/cancel")
	id = strings.TrimSuffix(id, "/cancel")
	data, err := pbRequest("GET", "/api/collections/music_import_jobs/records/"+url.PathEscape(id), token, nil)
	if err != nil || data["owner"] != owner { jsonOut(w, 404, map[string]string{"error":"job not found"}); return }
	if cancel && r.Method == "POST" {
		if value, ok := jobs.Load(id); ok { value.(jobControl).cancel() }
		_, _ = pbRequest("PATCH", "/api/collections/music_import_jobs/records/"+id, token, map[string]any{"status":"cancelled"})
		jsonOut(w, 200, map[string]bool{"cancelled":true}); return
	}
	jsonOut(w, 200, data)
}

func updateJob(token, id string, patch map[string]any) { _, _ = pbRequest("PATCH", "/api/collections/music_import_jobs/records/"+id, token, patch) }

func runImport(ctx context.Context, token, owner, jobID, sourceURL, kind string) {
	defer jobs.Delete(jobID)
	updateJob(token, jobID, map[string]any{"status":"resolving"})
	meta, err := spot.GetFilteredSpotifyData(ctx, sourceURL, true, 250*time.Millisecond, ", ", nil)
	if err != nil { updateJob(token, jobID, map[string]any{"status":"failed", "error":err.Error()}); return }
	info, list, err := normalizeMetadata(meta, kind)
	if err != nil || len(list) == 0 { if err == nil { err = errors.New("Spotify returned no tracks") }; updateJob(token, jobID, map[string]any{"status":"failed", "error":err.Error()}); return }
	updateJob(token, jobID, map[string]any{"status":"downloading", "title":info["title"], "description":info["description"], "cover":info["cover"], "total":len(list)})

	items := make([]map[string]any, 0, len(list)); trackIDs := make([]string, 0, len(list)); failed := 0
	for index, item := range list {
		if ctx.Err() != nil { updateJob(token, jobID, map[string]any{"status":"cancelled", "items":items, "track_ids":trackIDs}); return }
		updateJob(token, jobID, map[string]any{"current_track":item.Name, "completed":len(trackIDs), "failed":failed})
		recordID, provider, err := importTrack(ctx, token, owner, item, index+1)
		state := map[string]any{"spotify_id":item.SpotifyID, "title":item.Name, "artist":item.Artists, "status":"completed", "record_id":recordID, "provider":provider}
		if err != nil { failed++; state["status"] = "failed"; state["error"] = err.Error() } else { trackIDs = append(trackIDs, recordID) }
		items = append(items, state)
		updateJob(token, jobID, map[string]any{"items":items, "track_ids":trackIDs, "completed":len(trackIDs), "failed":failed})
	}
	status := "completed"; if failed > 0 && len(trackIDs) > 0 { status = "partial" }; if len(trackIDs) == 0 { status = "failed" }
	updateJob(token, jobID, map[string]any{"status":status, "completed":len(trackIDs), "failed":failed, "current_track":""})
}

func normalizeMetadata(value any, kind string) (map[string]string, []track, error) {
	data, _ := json.Marshal(value); var root map[string]any; if json.Unmarshal(data, &root) != nil { return nil, nil, errors.New("invalid Spotify metadata") }
	info := map[string]string{"title":"Spotify import"}
	var rows []any
	if kind == "track" { if one, ok := root["track"].(map[string]any); ok { rows = []any{one}; info["title"] = stringValue(one,"name"); info["cover"] = stringValue(one,"images") } }
	if kind == "album" { rows, _ = root["track_list"].([]any); if album, ok := root["album_info"].(map[string]any); ok { info["title"] = stringValue(album,"name"); info["cover"] = stringValue(album,"images") } }
	if kind == "playlist" { rows, _ = root["track_list"].([]any); if playlist, ok := root["playlist_info"].(map[string]any); ok { info["cover"] = stringValue(playlist,"cover"); info["description"] = stringValue(playlist,"description"); if owner, ok := playlist["owner"].(map[string]any); ok { info["title"] = stringValue(owner,"name") } } }
	result := make([]track, 0, len(rows)); for _, row := range rows { if item, ok := row.(map[string]any); ok { result = append(result, decodeTrack(item)) } }
	return info, result, nil
}

func stringValue(m map[string]any, key string) string { value, _ := m[key].(string); return value }
func intValue(m map[string]any, key string) int { value, _ := m[key].(float64); return int(value) }
func pocketbaseDate(value string) string {
	value = strings.TrimSpace(value)
	if len(value) == 4 { return value+"-01-01" }
	if len(value) == 7 { return value+"-01" }
	if len(value) >= 10 { return value[:10] }
	return ""
}
func decodeTrack(m map[string]any) track { return track{
	SpotifyID:stringValue(m,"spotify_id"), Name:stringValue(m,"name"), Artists:stringValue(m,"artists"), AlbumName:stringValue(m,"album_name"), AlbumArtist:stringValue(m,"album_artist"), Cover:stringValue(m,"images"), ReleaseDate:stringValue(m,"release_date"), AlbumID:stringValue(m,"album_id"), ArtistID:stringValue(m,"artist_id"), UPC:stringValue(m,"upc"), Copyright:stringValue(m,"copyright"), Publisher:stringValue(m,"publisher"), Composer:stringValue(m,"composer"), DurationMS:intValue(m,"duration_ms"), TrackNumber:intValue(m,"track_number"), DiscNumber:intValue(m,"disc_number"), TotalTracks:intValue(m,"total_tracks"), TotalDiscs:intValue(m,"total_discs"), Explicit:m["is_explicit"] == true,
} }

func findExisting(token, owner, spotifyID string) string {
	filter := url.QueryEscape("owner='"+owner+"' && spotify_id='"+spotifyID+"'")
	data, err := pbRequest("GET", "/api/collections/music_tracks/records?perPage=1&filter="+filter, token, nil); if err != nil { return "" }
	items, _ := data["items"].([]any); if len(items) > 0 { if item, ok := items[0].(map[string]any); ok { id, _ := item["id"].(string); return id } }; return ""
}

func importTrack(ctx context.Context, token, owner string, item track, position int) (string, string, error) {
	if existing := findExisting(token, owner, item.SpotifyID); existing != "" { return existing, "existing", nil }
	dir, err := os.MkdirTemp("", "monochrome-spotiflac-"); if err != nil { return "", "", err }; defer os.RemoveAll(dir)
	isrc := spot.ResolveTrackISRC(item.SpotifyID); spotifyURL := "https://open.spotify.com/track/"+item.SpotifyID
	var file, provider string
	qobuz := spot.NewQobuzDownloader()
	file, err = qobuz.DownloadTrackWithISRC(isrc, dir, "27", "title-artist", false, position, item.Name, item.Artists, item.AlbumName, item.AlbumArtist, item.ReleaseDate, false, item.Cover, true, item.TrackNumber, item.DiscNumber, item.TotalTracks, item.TotalDiscs, item.Copyright, item.Publisher, item.Composer, ", ", spotifyURL, true, false, false, true)
	provider = "qobuz"
	if err != nil {
		tidal := spot.NewTidalDownloader("")
		file, err = tidal.Download(item.SpotifyID, dir, "HI_RES_LOSSLESS", "title-artist", false, position, item.Name, item.Artists, item.AlbumName, item.AlbumArtist, item.ReleaseDate, false, item.Cover, true, item.TrackNumber, item.DiscNumber, item.TotalTracks, item.TotalDiscs, item.Copyright, item.Publisher, item.Composer, ", ", isrc, spotifyURL, true, false, "LOSSLESS", false, false, true)
		provider = "tidal"
	}
	if err != nil { return "", provider, err }
	lyrics := fetchTTML(item)
	artistID, albumID := upsertCatalog(token, owner, item)
	record, err := uploadTrack(token, owner, item, isrc, provider, lyrics, file, artistID, albumID)
	if err != nil { return "", provider, err }
	id, _ := record["id"].(string); return id, provider, nil
}

func fetchTTML(item track) string {
	lyrics, _, err := spot.NewLyricsClient().FetchLyricsAllSources(item.SpotifyID, item.Name, item.Artists, item.AlbumName, item.DurationMS/1000)
	if err != nil || lyrics == nil || len(lyrics.Lines) == 0 { return "" }
	var b strings.Builder; b.WriteString(`<?xml version="1.0" encoding="UTF-8"?><tt xmlns="http://www.w3.org/ns/ttml"><body><div>`)
	for index, line := range lyrics.Lines { start, _ := strconv.ParseInt(line.StartTimeMs,10,64); end := int64(item.DurationMS); if index+1 < len(lyrics.Lines) { if next, e := strconv.ParseInt(lyrics.Lines[index+1].StartTimeMs,10,64); e == nil && next > start { end = next } }; fmt.Fprintf(&b, `<p begin="%.3fs" end="%.3fs">%s</p>`, float64(start)/1000, float64(end)/1000, xmlEscape(line.Words)) }
	b.WriteString(`</div></body></tt>`); return b.String()
}

func xmlEscape(value string) string { value = strings.ReplaceAll(value,"&","&amp;"); value = strings.ReplaceAll(value,"<","&lt;"); value = strings.ReplaceAll(value,">","&gt;"); return value }

func findCatalogRecord(token, collection, owner, spotifyID string) string {
	if spotifyID == "" { return "" }
	filter := url.QueryEscape("owner='"+owner+"' && spotify_id='"+spotifyID+"'")
	data, err := pbRequest("GET", "/api/collections/"+collection+"/records?perPage=1&filter="+filter, token, nil)
	if err != nil { return "" }
	items, _ := data["items"].([]any)
	if len(items) > 0 { if row, ok := items[0].(map[string]any); ok { id, _ := row["id"].(string); return id } }
	return ""
}

func upsertCatalog(token, owner string, item track) (string, string) {
	artistSpotifyID := item.ArtistID
	if artistSpotifyID == "" { artistSpotifyID = "name-"+strings.ToLower(strings.ReplaceAll(item.Artists," ","-")) }
	artistID := findCatalogRecord(token,"music_artists",owner,artistSpotifyID)
	if artistID == "" {
		record, err := pbRequest("POST","/api/collections/music_artists/records",token,map[string]any{"owner":owner,"spotify_id":artistSpotifyID,"name":item.Artists,"image":item.Cover,"spotify_url":"https://open.spotify.com/artist/"+item.ArtistID,"genres":[]string{}})
		if err == nil { artistID, _ = record["id"].(string) }
	}
	albumSpotifyID := item.AlbumID
	if albumSpotifyID == "" { albumSpotifyID = "album-"+strings.ToLower(strings.ReplaceAll(item.AlbumArtist+"-"+item.AlbumName," ","-")) }
	albumID := findCatalogRecord(token,"music_albums",owner,albumSpotifyID)
	if albumID == "" {
		record, err := pbRequest("POST","/api/collections/music_albums/records",token,map[string]any{"owner":owner,"spotify_id":albumSpotifyID,"title":item.AlbumName,"artists":[]string{artistID},"artist_name":item.AlbumArtist,"cover":item.Cover,"spotify_url":"https://open.spotify.com/album/"+item.AlbumID,"upc":item.UPC,"release_date":pocketbaseDate(item.ReleaseDate),"total_tracks":item.TotalTracks,"total_discs":item.TotalDiscs,"label":item.Publisher,"copyright":item.Copyright})
		if err == nil { albumID, _ = record["id"].(string) }
	}
	return artistID, albumID
}

func uploadTrack(token, owner string, item track, isrc, provider, lyrics, audioPath, artistID, albumID string) (map[string]any, error) {
	temp, err := os.CreateTemp("", "monochrome-pb-upload-"); if err != nil { return nil, err }; defer os.Remove(temp.Name()); defer temp.Close()
	w := multipart.NewWriter(temp)
	fields := map[string]string{"owner":owner,"title":item.Name,"artist":item.Artists,"album":item.AlbumName,"album_artist":item.AlbumArtist,"release_date":pocketbaseDate(item.ReleaseDate),"duration":fmt.Sprint(float64(item.DurationMS)/1000),"track_number":fmt.Sprint(item.TrackNumber),"disc_number":fmt.Sprint(item.DiscNumber),"total_tracks":fmt.Sprint(item.TotalTracks),"total_discs":fmt.Sprint(item.TotalDiscs),"explicit":fmt.Sprint(item.Explicit),"spotify_id":item.SpotifyID,"spotify_url":"https://open.spotify.com/track/"+item.SpotifyID,"isrc":isrc,"upc":item.UPC,"composer":item.Composer,"publisher":item.Publisher,"copyright":item.Copyright,"source_provider":provider,"lyrics":lyrics}
	if artistID != "" { fields["artists_rel"] = artistID }
	if albumID != "" { fields["album_rel"] = albumID }
	for key, value := range fields { _ = w.WriteField(key,value) }
	part, err := w.CreateFormFile("audio", filepath.Base(audioPath)); if err != nil { return nil, err }; audio, err := os.Open(audioPath); if err != nil { return nil, err }; _, err = io.Copy(part,audio); audio.Close(); if err != nil { return nil, err }
	if item.Cover != "" { if resp, e := client.Get(item.Cover); e == nil && resp.StatusCode < 300 { cover, _ := w.CreateFormFile("cover","cover.jpg"); _, _ = io.Copy(cover,io.LimitReader(resp.Body,10<<20)); resp.Body.Close() } }
	_ = w.Close(); _, _ = temp.Seek(0,0)
	req, _ := http.NewRequest("POST",pocketbase+"/api/collections/music_tracks/records",temp); req.Header.Set("Authorization","Bearer "+token); req.Header.Set("Content-Type",w.FormDataContentType())
	resp, err := client.Do(req); if err != nil { return nil, err }; defer resp.Body.Close(); data, _ := io.ReadAll(resp.Body); var result map[string]any; _ = json.Unmarshal(data,&result); if resp.StatusCode >= 300 { return nil,fmt.Errorf("track upload %d: %s",resp.StatusCode,string(data)) }; return result,nil
}

func main() {
	spot.AppVersion = "7.2.0"
	mux := http.NewServeMux(); mux.HandleFunc("/api/selfhost/imports",handleImports); mux.HandleFunc("/api/selfhost/imports/",handleJob); health := func(w http.ResponseWriter,_ *http.Request){jsonOut(w,200,map[string]string{"status":"ok","engine":"SpotiFLAC v7.2.0"})}; mux.HandleFunc("/health",health); mux.HandleFunc("/api/selfhost/health",health)
	server := &http.Server{Addr:":"+port,Handler:mux,ReadHeaderTimeout:10*time.Second}; log.Printf("Monochrome SpotiFLAC importer listening on :%s",port); log.Fatal(server.ListenAndServe())
}
