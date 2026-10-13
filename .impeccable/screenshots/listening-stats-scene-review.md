## verdict

| Material fix | Score | Evidence |
| --- | --- | --- |
| Approved inline caption; remove eyebrow | Resolved | `listening-stats-scene-desktop-caption-final.jpg` and `listening-stats-scene-mobile-caption.jpg` show the inline label/title clearly below all rotated covers, with the artist and play action retained. |
| Responsive chart coordinates | Resolved | `listening-stats-scene-mobile-ledgers.jpg` shows readable date/value labels; source rebuilds the 400/1000 viewBox when the container crosses 560px. |
| Truthful most-played selection | Resolved | `js/listening-stats.js` derives `most` from `d.top.tracks[0]`, independently of artwork filtering; the displayed title/play target use that record. |
| Scoped Stats persistence | Resolved | DESIGN.md now records Listening Stage, approved B, seed `5d21f129`, artwork authority, fan, and current responsive/motion behavior. |

## remaining

Clear. No regressions visible from the caption-clearance fix batch.

disposition: ship
