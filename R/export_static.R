# R/export_static.R
# Run from the site folder:  source("R/export_static.R")
# Reads the Shiny app's inputs from SRC and writes everything the site needs
# into docs/data/. Packages: terra, sf, jsonlite, viridisLite, png

library(terra); library(sf); library(jsonlite); library(viridisLite); library(png)
source("R/config.R")

SRC <- path.expand(SRC)
stopifnot("Set SRC in R/config.R to your Shiny app folder" = file.exists(file.path(SRC, "trend_means.csv")))

PAL <- substr(viridis(256, option = "D"), 1, 7)   # same palette as the Shiny app
dir.create(OUT, recursive = TRUE, showWarnings = FALSE)

# One band -> one PNG. Each pixel is one 300 m cell; NA cells are transparent.
write_png <- function(r, lo, hi, path) {
  m   <- as.matrix(r, wide = TRUE)                 # rows run north to south
  ok  <- is.finite(m)
  idx <- pmin(pmax(round((m - lo) / (hi - lo) * 255) + 1, 1), 256)
  rgb <- col2rgb(PAL) / 255
  img <- array(0, c(nrow(m), ncol(m), 4))
  for (k in 1:3) {
    ch <- matrix(0, nrow(m), ncol(m)); ch[ok] <- rgb[k, idx[ok]]; img[, , k] <- ch
  }
  img[, , 4] <- ok
  writePNG(img, path)
}

# Lon/lat of the raster's corners: top-left, top-right, bottom-right, bottom-left
corners_lonlat <- function(r) {
  xy <- data.frame(x = c(xmin(r), xmax(r), xmax(r), xmin(r)),
                   y = c(ymax(r), ymax(r), ymin(r), ymin(r)))
  p <- st_as_sf(xy, coords = c("x", "y"), crs = 3857) |> st_transform(4326)
  unname(round(st_coordinates(p), 6))
}

# ---- Part 1: map layers + histograms ---------------------------------------
manifest <- list(title = "Kelp Future Preview", version = APP_VERSION,
                 updated = format(Sys.Date()), palette = PAL,
                 species_order = names(species_config), species = list())

for (sp in names(species_config)) {
  cfg <- species_config[[sp]]
  dir.create(file.path(OUT, "layers", sp), recursive = TRUE, showWarnings = FALSE)
  layers <- list(); hists <- list()

  for (v in cfg$vars) {
    message(sp, " / ", v)
    s   <- rast(file.path(SRC, cfg$dir, paste0(v, "_stack.tif")))
    # One color scale for every year of this variable.
    # For the Shiny-style per-year scale, compute rng inside the year loop instead.
    rng <- range(minmax(s, compute = TRUE), na.rm = TRUE)
    if (diff(rng) == 0) rng <- rng + c(-0.5, 0.5)
    breaks <- seq(rng[1], rng[2], length.out = 31)   # 30 bins, as in the Shiny histogram
    counts <- list()

    for (yr in names(s)) {
      band <- s[[yr]]
      write_png(band, rng[1], rng[2], file.path(OUT, "layers", sp, paste0(v, "_", yr, ".png")))
      x <- values(band, mat = FALSE); x <- x[is.finite(x)]
      counts[[yr]] <- hist(x, breaks = breaks, plot = FALSE, include.lowest = TRUE)$counts
    }
    layers[[v]] <- list(range = signif(rng, 4), corners = corners_lonlat(s))
    hists[[v]]  <- list(breaks = signif(breaks, 4), counts = counts)
  }
  write_json(hists, file.path(OUT, paste0("hist_", sp, ".json")), digits = NA)

  yrs <- sort(as.numeric(names(rast(file.path(SRC, cfg$dir, paste0(cfg$response, "_stack.tif"))))))
  manifest$species[[sp]] <- list(
    label = cfg$label, response = cfg$response, years = yrs,
    vars = lapply(cfg$vars, \(v) list(id = v, label = unname(cfg$var_labels[[v]]))),
    bounds = as.list(cfg$bounds), lat50_lng = cfg$lat50_lng, layers = layers)
}

# ---- Part 2: plots, overlays, manifest -------------------------------------
# Mean over time: same table the Shiny trend plot uses
tm <- read.csv(file.path(SRC, "trend_means.csv"), stringsAsFactors = FALSE)
tm <- tm[order(tm$species, tm$var, tm$year), c("species", "var", "year", "mean_value")]
write_json(tm, file.path(OUT, "trend_means.json"), digits = NA)

# 50% density latitude, keyed by species id (bull / giant)
l50 <- read.csv(file.path(SRC, "kelp_lat50_by_year.csv"), stringsAsFactors = FALSE)
lat50 <- lapply(species_config, \(cfg) {
  d <- l50[l50$species == cfg$lat50_species, c("year", "lat_50")]
  d[order(d$year), ]
})
write_json(lat50, file.path(OUT, "lat50.json"), digits = NA)

# MPAs: same simplification as app.R, plus the hover label
mpa <- st_read(file.path(SRC, "shp/California_Marine_Protected_Areas_[ds582].shp"), quiet = TRUE) |>
  st_simplify(dTolerance = 20, preserveTopology = TRUE) |>
  st_transform(4326)
name_col <- intersect(c("FULLNAME", "NAME", "Name", "SHORTNAME", "NAME_SHORT"), names(mpa))[1]
mpa$mpa_label <- if (!is.na(name_col)) as.character(mpa[[name_col]]) else "Marine Protected Area"
st_write(mpa["mpa_label"], file.path(OUT, "mpas.geojson"), delete_dsn = TRUE, quiet = TRUE,
         layer_options = "COORDINATE_PRECISION=5")

# Restoration class outlines
cz <- readRDS(file.path(SRC, "class_zones.rds")) |> st_transform(4326)
cz$class <- as.character(cz$class)
st_write(cz["class"], file.path(OUT, "class_zones.geojson"), delete_dsn = TRUE, quiet = TRUE,
         layer_options = "COORDINATE_PRECISION=5")

write_json(manifest, file.path(OUT, "manifest.json"), auto_unbox = TRUE, digits = NA, pretty = TRUE)
message("Done. Preview with: servr::httd('docs')")
