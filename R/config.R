# R/config.R
# ---------------------------------------------------------------------------
# 1. EDIT THIS LINE: the folder that holds app.R and its inputs
#    (raster_stacks_3857/, shp/, class_zones.rds, trend_means.csv,
#     kelp_lat50_by_year.csv)
SRC <- "/Users/benjaminbray/KelpApp"
# ---------------------------------------------------------------------------

APP_VERSION <- "0.0.2-static"
OUT <- "docs/data"

# First year exported. Bands, histograms, trend means and 50% latitudes
# before this are skipped (same cutoff as first_year in app.R).
FIRST_YEAR <- 2025

# Copied from app.R (dir paths are relative to SRC)
species_config <- list(
  bull = list(
    label = "Bull Kelp",
    dir = "raster_stacks_3857/bull",
    response = "nerlue_log",
    vars = c(
      "urchin_log", "depth", "taucross_surface_upwelling",
      "no3_surface_summer", "taualong_surface_upwelling",
      "temp_deepest_upwelling", "prob_rock", "nerlue_log"
    ),
    var_labels = c(
      nerlue_log                  = "Bull kelp log density",
      urchin_log                  = "Urchin density (log)",
      depth                       = "Depth",
      taucross_surface_upwelling  = "Cross-shore wind stress (upwelling)",
      no3_surface_summer          = "Nitrate, surface summer",
      taualong_surface_upwelling  = "Alongshore wind stress (upwelling)",
      temp_deepest_upwelling      = "Temperature, deepest (upwelling)",
      prob_rock                   = "Probability of rock substrate"
    ),
    bounds = c(lng1 = -124.6, lat1 = 37.6, lng2 = -122.3, lat2 = 40.9),   # San Francisco to Eureka
    lat50_species = "Bull kelp",
    lat50_lng     = c(-124.8, -120.3)
  ),
  giant = list(
    label = "Giant Kelp",
    dir = "raster_stacks_3857/giant",
    response = "macstipes_log",   # layer selected when giant kelp is chosen
    vars = c(
      "urchin_log", "depth", "taucross_surface_upwelling",
      "temp_surface_upwelling", "no3_deepest_summer",
      "taualong_surface_upwelling", "temp_deepest_upwelling",
      "macpyr_log", "macstipes_log"
    ),
    var_labels = c(
      macpyr_log                  = "Giant kelp density (log)",
      macstipes_log               = "Giant kelp stipe density (log)",
      urchin_log                  = "Urchin density (log)",
      depth                       = "Depth",
      taucross_surface_upwelling  = "Cross-shore wind stress (upwelling)",
      temp_surface_upwelling      = "Temperature, surface (upwelling)",
      no3_deepest_summer          = "Nitrate, deepest summer",
      taualong_surface_upwelling  = "Alongshore wind stress (upwelling)",
      temp_deepest_upwelling      = "Temperature, deepest (upwelling)"
    ),
    bounds = c(lng1 = -120.6, lat1 = 33.2, lng2 = -119.0, lat2 = 34.3),
    lat50_species = "Giant kelp",
    lat50_lng     = c(-122.6, -117.0)
  )
)
