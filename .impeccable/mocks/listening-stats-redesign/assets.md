# Listening Stats B — asset manifest

Approved reference: `scene-b.png` (1536 × 1024). The reference's sample covers, artist names, numbers and dates are composition guidance only. Production content comes from the listening response. No mock pixels ship.

## produce

Empty. No generated covers, invented media, raster chart, scene background, or baked interface is required.

## direct

| id | source_crop | output_path | strategy | prompt_used | dimensions | format | transparency | deviations | qa_status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| favorite-artwork | None; runtime `data.top.tracks[].cover` | Existing validated cover URL | Reuse real standalone album artwork; choose up to three distinct covers in ranking order | N/A | Native source dimensions; square presentation, center cover approximately 260 px at the reference width; use the existing artwork resolver for larger images when available | Existing image format | Preserve source | Actual listener artwork replaces illustrative mock albums | needs_parent_review |
| ranking-history-artwork | None; runtime ranked item/session track cover | Existing validated cover URL | Reuse the real item image through the existing `cover()` validation and fallback path | N/A | Native source dimensions; approximately 44–48 px square in rows | Existing image format | Preserve source | Real ranking and history determine images and order | needs_parent_review |

## semantic

| id | implementation | notes | qa_status |
| --- | --- | --- | --- |
| orbital-stage | Relative stage container with three independent square artwork elements; center cover above side covers, side covers rotated in opposing directions. CSS owns perspective, rotation, clipping, shadows, hover lift and bounded drift. Inline SVG ellipse behind/in front of the covers provides the thin white orbital trace; split trace layering if needed. Scale the stage fluidly and simplify overlap on narrow viewports. | Composes with `favorite-artwork`. Sample cover perspective must never be baked into media. Center emphasis should follow the leading real track. Fewer real covers means fewer cards. | needs_parent_review |
| cover-atmosphere | Absolutely positioned, pointer-inert color layers behind the orbital stage; blurred CSS radial fields use a cached palette from actual covers. Use `getVibrantColorFromImage()` where CORS permits; catch extraction failure and retain readable theme defaults. Validate provided theme colors with `normalizeTrackThemeColor()`. Fade old/new palette layers rather than animate expensive blur values. | Artwork supplies the pink/cyan/gold roles seen in B; actual colors vary with listening content. Pause motion when hidden and make reduced-motion static. | needs_parent_review |
| listening-measure | Semantic heading, dominant formatted listening-minute value, label, comparison and three supporting metrics in HTML. CSS owns the bold numeric silhouette and separators. JavaScript animates real aggregate values only on deliberate period changes. | Values, previous-period comparison and availability must be supplied by existing data; no sample assertions. Preserve content in reduced motion. | needs_parent_review |
| activity-wave | SVG viewBox chart with a real-data line, fill, fine activity bars, cover-derived stops and an inspection marker; HTML tooltip and accessible table/text alternative. CSS controls glow, stroke, responsive sizing and trace reveal. | B's low wide chart spans beneath both hero columns. Keep the line shape data-derived; zero/empty data must remain truthful. Keyboard inspection must match pointer inspection. | needs_parent_review |
| rotation-hour-analysis | Real artist shares rendered as SVG ring segments with linked HTML legend; hourly real-data bars in SVG or DOM with axes and readable summaries. Apply cached cover colors consistently across legend, ring and hourly chart. | Retain existing statistics and labels; do not infer artist identities from artwork. On mobile stack these below rankings. | needs_parent_review |
| controls-rankings-history | Existing semantic period/navigation buttons, refresh/export actions, ranking table and history list. Use incumbent Lucide SVG icons. CSS supplies B's restrained outlines, rounded panels, hairline row separators and transitions; visible focus and keyboard actions remain intact. | Existing sidebar/player are surrounding app chrome. Do not flatten controls or tables into images. Font assets remain the application's existing font family. | needs_parent_review |

## execution_order

1. Resolve the real ranked cover URLs and deduplicate the hero selection.
2. Build the stage geometry and hierarchy against B at 1536 × 1024.
3. Extract/cache cover colors and apply them to atmosphere and real-data charts.
4. Verify populated, sparse, missing-artwork, empty and reduced-motion states at desktop/mobile sizes.

## blockers

None for asset production. Final visual acceptance belongs to the implementation screenshot review.

## assumptions

- Runtime artwork is supplied by the existing listening response; no new download or media catalogue is needed.
- A missing or failed image uses the existing neutral music fallback, not a generated replacement.
- Cross-origin palette extraction can fail; rendering and readability must continue with theme defaults.
- No image files were created, altered or exported by this manifest task.
