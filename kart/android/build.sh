#!/usr/bin/env bash
# Gera o APK sem Gradle (aapt2 + javac + d8 + apksigner).
# Uso: kart/android/build.sh   (precisa do Docker; usa a imagem cimg/android)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
KART="$(dirname "$HERE")"
if [ -z "${ANDROID_HOME:-}" ]; then
  exec docker run --rm -u "$(id -u):$(id -g)" -v "$KART":/kart -w /kart/android cimg/android:2024.10.1 bash build.sh
fi
BT="$ANDROID_HOME/build-tools/35.0.0-rc4"
JAR="$ANDROID_HOME/platforms/android-33/android.jar"
VERSION_CODE="${VERSION_CODE:-2}"
VERSION_NAME="${VERSION_NAME:-2.0}"
B=build
rm -rf "$B"; mkdir -p "$B/gen" "$B/classes" "$B/assets"
cp -r ../web "$B/assets/web"

[ -f kart.keystore ] || keytool -genkeypair -keystore kart.keystore -alias kart -storepass kartturbo -keypass kartturbo \
  -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Kart Turbo" >/dev/null

"$BT/aapt2" compile --dir res -o "$B/res.zip"
"$BT/aapt2" link -o "$B/base.apk" -I "$JAR" --manifest AndroidManifest.xml -A "$B/assets" --java "$B/gen" \
  --min-sdk-version 21 --target-sdk-version 33 --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" "$B/res.zip"
javac -nowarn -Xlint:-options -source 8 -target 8 -bootclasspath "$JAR" -classpath "$JAR" -d "$B/classes" \
  "$B/gen/br/edge/kart/R.java" src/br/edge/kart/MainActivity.java
"$BT/d8" --release --lib "$JAR" --min-api 21 --output "$B" $(find "$B/classes" -name '*.class')
cp "$B/base.apk" "$B/unsigned.apk"
(cd "$B" && zip -q -u unsigned.apk classes.dex)
"$BT/zipalign" -f -p 4 "$B/unsigned.apk" "$B/aligned.apk"
"$BT/apksigner" sign --ks kart.keystore --ks-pass pass:kartturbo --key-pass pass:kartturbo --ks-key-alias kart \
  --out ../KartTurbo.apk "$B/aligned.apk"
"$BT/apksigner" verify ../KartTurbo.apk
rm -rf "$B"
echo "APK gerado: kart/KartTurbo.apk"
