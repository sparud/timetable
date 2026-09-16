#!/usr/bin/env bash
# Rasterises the SVG sources into every size Homey expects.
# Requires rsvg-convert (brew install librsvg).
set -euo pipefail
cd "$(dirname "$0")"
root=..

png() { rsvg-convert -w "$2" -h "$3" "$1" -o "$4"; }

cp icon.svg                 "$root/assets/icon.svg"

png app-banner.svg   250  175 "$root/assets/images/small.png"
png app-banner.svg   500  350 "$root/assets/images/large.png"
png app-banner.svg  1000  700 "$root/assets/images/xlarge.png"

for d in time range; do
  mkdir -p "$root/drivers/$d/assets/images"
  png "driver-$d.svg"   75   75 "$root/drivers/$d/assets/images/small.png"
  png "driver-$d.svg"  500  500 "$root/drivers/$d/assets/images/large.png"
  png "driver-$d.svg" 1000 1000 "$root/drivers/$d/assets/images/xlarge.png"
done

png preview-time-light.svg  1024 1024 "$root/widgets/time-picker/preview-light.png"
png preview-time-dark.svg   1024 1024 "$root/widgets/time-picker/preview-dark.png"
png preview-range-light.svg 1024 1024 "$root/widgets/range-picker/preview-light.png"
png preview-range-dark.svg  1024 1024 "$root/widgets/range-picker/preview-dark.png"

echo "artwork rebuilt"
