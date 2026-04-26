# Track data — Team Telemetry 25

Racing-line + pit-lane geometry vendored from **Team Telemetry 25**
(`%APPDATA%\Team Telemetry 25\Tracks`) with **explicit permission from the
Team Telemetry team** for use inside this application.

The TT team retains all rights to the data; this folder is shipped as part
of Apex Engineer under that grant. Please **do not redistribute these CSVs
outside this repository** without obtaining the same permission.

## File layout

| File | Format | Purpose |
|------|--------|---------|
| `Track_<id>.csv` | `distance;X;Z;0` | Recorded racing-line samples |
| `Box_<id>.csv` | `distance;X;Z` | Pit-lane geometry |
| `Description/Track_Settings_<id>.csv` | `key;value` pairs | Track metadata (Rotate, Scale, TrackLength, PitDuration, …) |

`<id>` matches the F1 25 UDP track-id enum. Coordinates live in TT's
internal coord space; the renderer derives a transform from live F1
`worldPositionX/Z` to this space at runtime so cars line up correctly.

## Refresh path

If TT ships an updated track set, copy the contents of
`%APPDATA%\Team Telemetry 25\Tracks` over this folder (preserving the
`Description/` subfolder) and rebuild.
