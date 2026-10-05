# Example data — sources and license

The **code** in this repository is MIT-licensed. The **track data** in this folder is not code and has its own sources:

| File                             | Source                                                                                                                                                                                  | License                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `interlagos.track.json`          | Outline, corner names/numbers and positions derived from [OpenStreetMap](https://www.openstreetmap.org/) by `scripts/osm-outline`. Track facts (length, direction) added by hand.       | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) |
| `suzuka.track.json`              | Same as above. OSM tags T12 out of lap order, so T12's position is inferred from the track geometry. No start/finish node is mapped, so the start is placed halfway between T18 and T1. | ODbL 1.0                                                   |
| `interlagos.road-car.guide.json` | Hand-written **illustrative** numbers for testing the app. Not measured; not reference data.                                                                                            | MIT (with the code)                                        |

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the Open Database License. If you redistribute the OSM-derived files or data built from them, keep this attribution and the ODbL terms.

To regenerate: `pnpm osm-outline [trackId…]` (config in `scripts/osm-outline/tracks.ts`).
