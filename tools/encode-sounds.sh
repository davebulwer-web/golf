#!/bin/sh
# Makes the game's sounds in assets/sounds from Dave's Gravity Sound golf pack
# and birdsong recording: a few takes of each sound, trimmed, peak-levelled and
# squeezed to small mono MP3s. The pack itself isn't kept here (its licence
# allows using the sounds in a game but not passing the pack on).
# Run with: sh tools/encode-sounds.sh "<pack's Sound Effects folder>" <birdsong.mp3>
# (then node tools/pack-assets.mjs and node tools/build.mjs)
set -e
SRC="$1"; BIRDS="$2"; OUT=assets/sounds
mkdir -p "$OUT"
take() { # take <out name> <pack file name>: leading silence cut, peak at -1 dB
  peak=$(ffmpeg -hide_banner -i "$SRC/$2.wav" -af volumedetect -f null - 2>&1 | sed -n 's/.*max_volume: \(-*[0-9.]*\) dB/\1/p')
  ffmpeg -v error -y -i "$SRC/$2.wav" -ac 1 \
    -af "silenceremove=start_periods=1:start_threshold=-50dB,volume=$(echo "-1 - ($peak)" | bc)dB" \
    -ar 44100 -b:a 64k "$OUT/$1.mp3"
}
take driver1 'Driver Shot_1'; take driver2 'Driver Shot_4'; take driver3 'Driver Shot_9'
take iron1 'Iron Shot_9'; take iron2 'Iron Shot_12'; take iron3 'Iron Shot_2'
take chip1 'Chip Shot_1'; take chip2 'Chip Shot_3'; take chip3 'Chip Shot_5'
take bunker1 'Bunker Shot_5'; take bunker2 'Bunker Shot_6'; take bunker3 'Bunker Shot_10'
take putt1 'Putt Shot_1'; take putt2 'Putt Shot_3'; take putt3 'Putt Shot_4'
take bounce1 'Ball Bounce_1'; take bounce2 'Ball Bounce_5'; take bounce3 'Ball Bounce_7'
take water1 'Ball Lands in Water_2'; take water2 'Ball Lands in Water_5'; take water3 'Ball Lands in Water_10'
take tree1 'Ball hit tree_1'; take tree2 'Ball hit tree_2'; take tree3 'Ball hit tree_3'
take cup1 'Ball in Hole_1'; take cup2 'Ball in Hole_8'; take cup3 'Ball in Hole_12'; take cup4 'Ball in Hole_15'
take flag1 'Flag hit_2'; take flag2 'Flag hit_3'
take clap1 'Golf Clap_1'; take clap2 'Golf Clap_3'; take clap3 'Golf Clap_5'
take rattle1 'Clubs Rattle_3'; take rattle2 'Clubs Rattle_6'
take club1 'Take Club from Bag_2'; take club2 'Take Club from Bag_3'
# Birdsong: 90 seconds whose last 3 cross-fade into its first 3, so it loops
# without a join.
ffmpeg -v error -y -ss 3 -t 90 -i "$BIRDS" -t 3 -i "$BIRDS" \
  -filter_complex "[0:a][1:a]acrossfade=d=3,loudnorm=I=-20:TP=-2" \
  -ac 1 -ar 24000 -b:a 40k "$OUT/birdsong.mp3"
ls -l "$OUT"
