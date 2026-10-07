#!/usr/bin/env bash
# run.sh - Launcher untuk resi-printer tanpa perlu membuka VSCode

# Pastikan bun tersedia di PATH
if ! command -v bun >/dev/null 2>&1; then
  if [ -x "$HOME/.bun/bin/bun" ]; then
    export PATH="$HOME/.bun/bin:$PATH"
  elif [ -x "/usr/local/bin/bun" ]; then
    export PATH="/usr/local/bin:$PATH"
  fi
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "Error: 'bun' tidak ditemukan. Pastikan Bun terpasang di sistem Anda." >&2
  exit 1
fi

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESI_BIN="$PROJECT_DIR/bin/resi.mjs"

# Jika ada argumen yang dikirim (misal: ./run.sh web, ./run.sh scan, ./run.sh import file.pdf)
if [ $# -gt 0 ]; then
  exec bun "$RESI_BIN" "$@"
fi

# Jika di terminal interaktif dan tanpa argumen, tampilkan menu
if [ -t 0 ]; then
  clear
  echo "====================================================="
  echo "         RESI PRINTER - THERMAL BLE PRINT           "
  echo "====================================================="
  echo "1) Buka Web UI di Browser (Rekomendasi) [Default]"
  echo "2) Scan Printer Bluetooth (BLE)"
  echo "3) Pratinjau (Preview) Resi Contoh"
  echo "4) Import & Cetak File (PDF/PNG)"
  echo "5) Pasang shortcut perintah 'resi' global ke Terminal"
  echo "6) Bantuan CLI (Help)"
  echo "0) Keluar"
  echo "====================================================="
  read -r -p "Pilih menu [1]: " choice
  choice="${choice:-1}"

  case "$choice" in
    1)
      echo "Menjalankan Web UI..."
      exec bun "$RESI_BIN" web
      ;;
    2)
      echo "Memindai perangkat Bluetooth..."
      exec bun "$RESI_BIN" scan
      ;;
    3)
      echo "Menampilkan pratinjau label..."
      exec bun "$RESI_BIN" preview --file "$PROJECT_DIR/assets/resi.pdf"
      ;;
    4)
      read -r -p "Masukkan path file PDF atau PNG: " filepath
      if [ -n "$filepath" ]; then
        exec bun "$RESI_BIN" import "$filepath"
      else
        echo "Path file tidak boleh kosong."
        exit 1
      fi
      ;;
    5)
      mkdir -p "$HOME/.local/bin"
      WRAPPER="$HOME/.local/bin/resi"
      cat << 'EOF' > "$WRAPPER"
#!/usr/bin/env bash
if ! command -v bun >/dev/null 2>&1; then
  if [ -x "$HOME/.bun/bin/bun" ]; then
    export PATH="$HOME/.bun/bin:$PATH"
  fi
fi
PROJECT_DIR="/Users/risanggalih/Desktop/personal/resi-printer"
if [ $# -eq 0 ]; then
  exec bun "$PROJECT_DIR/bin/resi.mjs" web
else
  exec bun "$PROJECT_DIR/bin/resi.mjs" "$@"
fi
EOF
      chmod +x "$WRAPPER"
      echo "Sukses! Shortcut 'resi' terpasang di: $WRAPPER"
      echo "Sekarang Anda dapat menjalankan perintah 'resi' atau 'resi web' dari folder mana saja di Terminal."
      ;;
    6)
      exec bun "$RESI_BIN" help
      ;;
    0)
      echo "Keluar."
      exit 0
      ;;
    *)
      echo "Pilihan tidak valid. Menjalankan Web UI..."
      exec bun "$RESI_BIN" web
      ;;
  esac
else
  # Non-interaktif, default ke web
  exec bun "$RESI_BIN" web
fi

