# VOR projections pipeline for the draft app.
#
# Usage:   Rscript ffanalytics_vor.R [season]
#          (season defaults to the current year)
# Output:  output/fantasyFootball_vor_<season>.csv
#
# Docs: https://ffanalytics.fantasyfootballanalytics.net/
#       https://github.com/FantasyFootballAnalytics/ffanalytics
#
# After running, load the result into the app with:  python3 load_latest.py

suppressPackageStartupMessages({
  if (!requireNamespace("ffanalytics", quietly = TRUE)) {
    stop(
      "ffanalytics is not installed. Run:\n",
      '  install.packages("remotes")\n',
      '  remotes::install_github("FantasyFootballAnalytics/ffanalytics")'
    )
  }
  library(ffanalytics)
  library(dplyr)
})

args <- commandArgs(trailingOnly = TRUE)
season <- if (length(args) >= 1) as.integer(args[[1]]) else as.integer(format(Sys.Date(), "%Y"))
message("Scraping projections for season ", season, " …")

SOURCES <- c(
  "CBS", "ESPN", "FantasyPros", "FantasySharks", "FFToday", "NumberFire",
  "FantasyFootballNerd", "NFL", "RTSports", "Walterfootball"
)
POSITIONS <- c("QB", "RB", "WR", "TE", "DST", "K")

my_scrape <- scrape_data(src = SOURCES, pos = POSITIONS, season = season, week = 0)

# Scoring rules shared by all three scoring types; only `rec` differs.
scoring_rules_for <- function(rec_pts) {
  list(
    pass = list(
      pass_att = 0, pass_comp = 0, pass_inc = 0, pass_yds = 0.04, pass_tds = 4,
      pass_int = -2, pass_40_yds = 0, pass_300_yds = 0, pass_350_yds = 0,
      pass_400_yds = 0
    ),
    rush = list(
      all_pos = TRUE,
      rush_yds = 0.1, rush_att = 0, rush_40_yds = 0, rush_tds = 6,
      rush_100_yds = 0, rush_150_yds = 0, rush_200_yds = 0
    ),
    rec = list(
      all_pos = TRUE,
      rec = rec_pts, rec_yds = 0.1, rec_tds = 6, rec_40_yds = 0, rec_100_yds = 0,
      rec_150_yds = 0, rec_200_yds = 0
    ),
    misc = list(
      all_pos = TRUE,
      fumbles_lost = -2, fumbles_total = 0,
      sacks = 0, two_pts = 2
    ),
    kick = list(
      xp = 1.0, fg_0019 = 3.0, fg_2029 = 3.0, fg_3039 = 3.0, fg_4049 = 4.0,
      fg_50 = 5.0, fg_miss = -0.5
    ),
    ret = list(
      all_pos = TRUE,
      return_tds = 6, return_yds = 0
    ),
    idp = list(
      all_pos = TRUE,
      idp_solo = 1, idp_asst = 0.5, idp_sack = 2, idp_int = 3, idp_fum_force = 3,
      idp_fum_rec = 2, idp_pd = 1, idp_td = 6, idp_safety = 2
    ),
    dst = list(
      dst_fum_rec = 2, dst_int = 2, dst_safety = 2, dst_sacks = 1, dst_td = 6,
      dst_blk = 1.5, dst_ret_yds = 0, dst_pts_allowed = 0
    ),
    pts_bracket = list(
      list(threshold = 0, points = 5),
      list(threshold = 6, points = 4),
      list(threshold = 13, points = 3),
      list(threshold = 17, points = 1),
      list(threshold = 34, points = -1),
      list(threshold = 45, points = -3),
      list(threshold = 100, points = -5)
    )
  )
}

# with_extras: ECR/ADP/AAV/uncertainty are only attached to the PPR slice
# (matching the original app; the add_* sources key off default scoring).
build_projections <- function(scrape, rec_pts, label, with_extras) {
  message("Building ", label, " projections …")
  proj <- projections_table(
    scrape,
    scoring_rules = scoring_rules_for(rec_pts),
    avg_type = c("average", "robust", "weighted")
  )
  if (with_extras) {
    proj <- proj %>% add_ecr() %>% add_adp() %>% add_aav() %>% add_uncertainty()
  }
  proj <- proj %>% add_player_info()
  if (!with_extras) {
    proj$overall_ecr <- NA
    proj$pos_ecr <- NA
    proj$sd_ecr <- NA
    proj$adp <- NA
    proj$adp_sd <- NA
    proj$adp_diff <- NA
    proj$aav <- NA
    proj$aav_sd <- NA
    proj$uncertainty <- NA
  }
  proj$scoring_type <- label
  proj
}

ppr      <- build_projections(my_scrape, 1.0, "PPR", with_extras = TRUE)
half_ppr <- build_projections(my_scrape, 0.5, "Half-PPR", with_extras = FALSE)
# NOTE: the original 2024 script mistakenly used rec = 0.5 here too, so its
# "Non-PPR" slice was really Half-PPR. Fixed: true zero-point receptions.
non_ppr  <- build_projections(my_scrape, 0.0, "Non-PPR", with_extras = FALSE)

combined <- bind_rows(ppr, half_ppr, non_ppr)

out_dir <- file.path(dirname(sub("--file=", "", grep("--file=", commandArgs(), value = TRUE)[1])), "output")
if (is.na(out_dir) || out_dir == "output") out_dir <- "output"
dir.create(out_dir, showWarnings = FALSE, recursive = TRUE)
out_file <- file.path(out_dir, paste0("fantasyFootball_vor_", season, ".csv"))

write.csv(combined, out_file)
message("Wrote ", nrow(combined), " rows to ", out_file)
