# Kelp Future Preview: static site

A static version of the Kelp Future Preview Shiny app. R turns the Shiny app's
inputs into small files in `docs/data/`, and `docs/` is a plain website (MapLibre +
Chart.js) that GitHub Pages can host for free.

## Build and preview (about 30 minutes the first time)

1. Open this folder in RStudio (or `setwd()` to it).
2. In `R/config.R`, set `SRC` to the folder that holds `app.R` and its inputs.
3. Install packages if needed:
   `install.packages(c("terra", "sf", "jsonlite", "viridisLite", "png", "servr"))`
4. Run `source("R/export_static.R")`. It writes the PNGs, JSON and GeoJSON into `docs/data/`.
5. Run `servr::httd("docs")` and open the address it prints.
   (Opening `index.html` by double-clicking won't work: browsers block data loading from local files.)

## Live Site

3. The site appears at `https://benbray03.github.io/kelp-future-preview-site/` .

## Update

Rebuild the Shiny inputs as usual, bump `APP_VERSION` in `R/config.R`, rerun
`R/export_static.R`, and push. New years, variables and species in `species_config`
show up without any changes to the web code.

## Notes

- The color scale is fixed per variable across all years, so playback shows change over time.
  The Shiny app rescales each year. 
