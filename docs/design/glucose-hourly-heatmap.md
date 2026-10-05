# Glucose and context: hourly overview

Implemented in `src/components/glucose/GlucoseTimeline.tsx`, with aggregation and palettes in `src/glucoseHeatmap.ts`. This replaces the lower daily-distribution chart only; the upper fasting/meal-response chart remains separate.

- One column per tracking day, including days with no readings. Each day runs from 06:00 to the next 06:00, with morning at the bottom.
- Each occupied clock-hour cell shows the arithmetic mean of recorded samples. Blank cells are missing data, not interpolated values or zero glucose. Repeated daylight-saving clock hours share a cell.
- The top edge is normally 22:00. Any later reading extends the grid through its complete hourly cell, up to 06:00 next morning.
- The original palettes retain eight fixed glucose bands. The additional Target-relative palette uses hard-edged, unequal-width segments: identical red below/above the selected target, with dark teal → teal → light teal → teal → dark teal inside it. The lightest band is anchored at 5–6 mmol/L, not at the target midpoint. Each remaining tail is split in half: for the 3.9–10 target the boundaries are 3.9, 4.45, 5, 6, 8 and 10. Custom targets clip the anchor; empty segments are omitted from the legend without renumbering colours. A target entirely outside 5–6 therefore has no lightest-teal band. Values exactly on the target endpoints remain in range. Caps separately mark any sample outside the selected target, including excursions hidden by the hourly mean.
- The upper chart retains its normal 3–12 mmol/L numeric axis and expands to include outliers. The heatmap's vertical axis remains time of day; glucose values below 3 or above 12 are still represented, not discarded or clamped.
- The fasting stripe uses the first calendar-day reading before 10:00, labelled assumed unless tagged. Context lanes show daily carbohydrates, insulin, activity and complete sleep nights assigned to their wake date.
- Screen columns have a two-pixel minimum; long or narrow views scroll horizontally instead of dropping columns. Hover/tap or keyboard focus opens a transient popup with exact means, sample counts, minimum/maximum values and daily context. Leaving the grid, blurring focus or pressing Escape dismisses it. Arrow keys explore cells; Home/End move to the first/last date. There is no persistent detail panel or magnifier.
- The selector shares the title row at top right, with an accessible label but no separate visible label or subtitle. The vertical legend and context-lane labels align with the card's left edge. Hour labels sit beside the legend; the heatmap, fasting stripe and all context bars share a compact 104-pixel left plot boundary and aligned daily columns.
- The resize observer watches the actual scrolling viewport, and each rendered update rechecks its width before painting. On screen, the SVG viewport uses the same pixel width as its coordinate system, preventing SVG centring from offsetting context labels relative to the HTML legend while width measurements update. The plot ends two pixels inside the content's right edge rather than retaining surplus blank space.
- Distinct bands, Cool-to-warm, Blue scale and Target-relative each have light and dark palette variants. Selection changes only glucose-cell, fasting-stripe and legend colours; the card, grid background, axes and context-lane colours stay unchanged. Numeric foregrounds are chosen for at least 4.5:1 contrast. Mirrored target colours encode position within the chosen range, not separate diagnoses or a unique numeric glucose level; numeric legend labels and popups distinguish the two sides.
- Print retains the overview and left legend, fits all date columns, uses the light palette of the selected family, and omits the selector and popup.

The 5–6 visual anchor is a design choice informed by [1177's fasting reference information](https://www.1177.se/undersokning-behandling/undersokningar-och-provtagning/provtagning-och-matningar/blodprov/blodprov-p-glukos---blodsocker/) and a [healthy-participant CGM study](https://pmc.ncbi.nlm.nih.gov/articles/PMC7296129/). It is not a clinical grading scale, diagnosis or replacement for a person's selected target. Fasting laboratory references and continuous-sensor measurements do not define a universal normal band for ordinary meal-time spot readings. The selected target still determines red out-of-range status; [ADA's commonly used adult diabetes targets](https://diabetes.org/living-with-diabetes/treatment-care/checking-your-blood-sugar) provide separate context for target presets, not the shade interpolation.

Rendered previews use **synthetic illustrative data**, not imported patient measurements:

- [Light palette](mockups/glucose-hourly-heatmap-white.png)
- [Dark palette, unchanged white background](mockups/glucose-hourly-heatmap-dark.png)
- [Hover popup](mockups/glucose-hourly-heatmap-hover.png)
- [Print overview](mockups/glucose-hourly-heatmap-print.png)
- [Rebuilt Electron implementation, full report with synthetic import](mockups/glucose-hourly-heatmap-implementation.png)
- [Target-relative light palette, rebuilt Electron](mockups/glucose-target-relative-light.png)
- [Target-relative dark palette, rebuilt Electron](mockups/glucose-target-relative-dark.png)
- [Target-relative print overview, rebuilt Electron](mockups/glucose-target-relative-print.png)
