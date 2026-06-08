#!/usr/bin/env bash
# Run Alloy 6 model checks. By default runs every suite under docs/alloy.
# Pass a suite name (without .als) to run just one:
#
#   scripts/run-alloy.sh                       # all suites
#   scripts/run-alloy.sh session_lifecycle     # one suite
#
# Environment overrides:
#   ALLOY_JAR — path to the Alloy 6 fat jar (default ~/.local/share/june1815/alloy.jar)
#   JAVA      — Java executable to use (default `java`)
#   OUT       — output directory for analyzer JSON (default /tmp/june1815-alloy)
set -euo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." &> /dev/null && pwd)"
ALLOY_DIR="${REPO_ROOT}/docs/alloy"
OUT="${OUT:-/tmp/june1815-alloy}"
JAVA="${JAVA:-java}"
ALLOY_JAR="${ALLOY_JAR:-${HOME}/.local/share/june1815/alloy.jar}"

if [ ! -f "${ALLOY_JAR}" ]; then
  echo "ALLOY_JAR not found at ${ALLOY_JAR}. Download from:"
  echo "  https://github.com/AlloyTools/org.alloytools.alloy/releases/download/v6.2.0/org.alloytools.alloy.dist.jar"
  exit 2
fi

mkdir -p "${OUT}"
exit_code=0
if [ "$#" -eq 0 ]; then
  mapfile -t specs < <(find "${ALLOY_DIR}" -maxdepth 1 -type f -name '*.als' | sort)
else
  specs=()
  for name in "$@"; do
    spec="${ALLOY_DIR}/${name}.als"
    if [ ! -f "${spec}" ]; then
      echo "no such suite: ${name}" >&2
      exit 2
    fi
    specs+=("${spec}")
  done
fi

for spec in "${specs[@]}"; do
  base="$(basename "${spec}" .als)"
  echo "==> ${base}"
  if ! "${JAVA}" -jar "${ALLOY_JAR}" exec -f -t json -o "${OUT}/${base}" -c '*' "${spec}"; then
    echo "FAILED: ${spec}" >&2
    exit_code=1
  fi
done

exit ${exit_code}
