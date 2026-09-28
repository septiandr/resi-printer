# resi-printer

Cetak label **Shopee Xpress (SPX)** dari PDF, JSON, teks, atau form interaktif ke
printer thermal ESC/POS 58mm/80mm lewat **Bluetooth Low Energy**, tanpa perlu
driver dan tanpa lewat desktop.

```bash
bun install
bun bin/resi.mjs scan                            # cari printer BLE
bun bin/resi.mjs import assets/resi.pdf --yes    # cetak PDF apa adanya
bun bin/resi.mjs web                             # tampilan di browser
bun bin/resi.mjs print --file assets/resi.pdf --yes
```

## Kebutuhan

[Bun](https://bun.sh) 1.4 atau lebih baru - runtime, package manager, dan test
runner sekaligus. Node.js tidak lagi dipakai.

`bun install` sengaja memblokir postinstall `@stoprocent/noble` (binding
CoreBluetooth). Itu benar: addon-nya sudah menyertakan binary `.node` siap pakai
untuk macOS, jadi tidak ada yang perlu dikompilasi. Jangan `bun pm trust`.

Rasterisasi PDF memakai `qlmanage` (Quick Look), jadi pratinjau gambar hanya
tersedia di macOS. Di platform lain, `import` dari PDF perlu rasteriser lain.

## Cetak apa adanya (import)

Cara tercepat dan paling akurat: file PDF/PNG dicetak sebagai **gambar**, bukan
dibaca lalu digambar ulang. Tidak ada teks yang diekstrak, tidak ada tata letak
yang dihitung ulang - yang dicetak adalah berkas itu sendiri.

```bash
bun bin/resi.mjs import assets/resi.pdf --yes
bun bin/resi.mjs import label.png --dither
bun bin/resi.mjs import assets/resi.pdf --probe-width   # ukur lebar head
```

Yang terjadi di balik layar: PDF di-raster jadi gambar, margin putih dipangkas,
gambar discale ke lebar head dengan box filter (supaya barcode tipis tidak
hilang), jadi 1 bit per dot, lalu dikirim sebagai `GS v 0`.

| Opsi | Fungsi |
| --- | --- |
| `--dpi <n>` | Resolusi raster PDF. Default 450 |
| `--dither` | Ordered dithering, untuk gambar abu-abu tipis |
| `--threshold <0-255>` | Lebih gelap dari ini dibakar. Default 128 |
| `--invert` | Cetak area terang menjadi gelap |
| `--no-trim` | Jangan pangkas margin putih halaman |
| `--margin <n>` | Sisa ruang putih sekitar gambar, dalam dot. Default 3 |
| `--bottom <mm>` | Kertas kosong di bawah label, aman saat dirobek. Default 5 |
| `--scale <pct>` | Cetak pada ukuran tertentu, bukan memenuhi lebar |
| `--out <file>` | Tulis byte ESC/POS ke file, tanpa mencetak |
| `--probe-width` | Cetak penggaris dot untuk mengukur lebar head sebenarnya |

PDF di-raster memakai Quick Look bawaan macOS, pada resolusi yang dihitung dari
ukuran halaman pdfjs yang sebenarnya. Di sistem lain, ekspor ke PNG dulu, atau
pakai `resi web` yang meraster PDF di browser sebagai cadangan.

### Margin bawah

Kertas thermal dilepas dengan sobek, dan robekannya bisa mengenai baris dot
terakhir. `--bottom <mm>` menambah kertas kosong di bawah label sebelum perintah
potong, jadi area gambar aman. Default 5mm sudah cukup untuk sebagian besar
kertas; naikkan ke 8-12mm kalau label sering sobek dan bagian bawahnya ikut
terkupas. Di web UI ada di kolom **Margin bawah**.

### Lebar kertas

`--paper` menentukan lebar dalam **dot**, bukan milimeter kertas. Kertas 80mm
punya area cetak 576 dot; sisa tepi kiri/kanan tidak bisa dicetak.

`resi import --probe-width` mencetak penggaris 640 dot untuk mengukur head
sebenarnya. Pada RPP02N dengan kertas 80mm, dot sampai 576 pasti tercetak dan
raster 640 dot masih mendekati tepi kanan - 576 dipilih karena beberapa dot
terakhir dari raster yang lebih lebar terpotong.

## Tampilan web

`bun bin/resi.mjs web` membuka UI di browser (default <http://127.0.0.1:8137>)
dengan pratinjau label yang sama persis dengan yang dikirim ke printer.

- **Pratinjau langsung** - SVG yang digambar dari rencana yang sama dengan
  backend ESC/POS, jadi 1 unit = 1 dot printer. Area di luar kertas ditandai
  oleh test, bukan hanya dilihat.
- **Empat cara input** - tempel teks, unggah PDF (teks diekstrak di browser),
  isi form, atau **import PDF/PNG apa adanya**. Pratinjau memperbarui sendiri.
- **Import visual** - berkasnya dikirim ke server, yang meraster PDF dengan
  jalur yang **sama persis** dengan `resi import`. Pratinjau menampilkan
  titik-titik yang benar-benar akan dibakar, dan tombol cetak mengirim byte yang
  persis sama dengan yang digambar pratinjau - hasil pratinjau di-cache, jadi
  tidak ada rasterisasi kedua yang bisa meleset. PDF.js di browser hanya dipakai
  kalau server tidak punya rasteriser PDF (bukan macOS).
- **Cetak** - printer BLE dikendalikan dari server Bun, jadi tidak perlu
  dukungan Web Bluetooth di browser.
- **Scan BLE** - tombol di header untuk mencari printer sekitar.

`--port <n>` untuk mengganti port, `--no-open` untuk tidak membuka browser.

## Perintah

| Perintah | Fungsi |
| --- | --- |
| `scan` | Cari periferal BLE di sekitar |
| `probe` | Hubung dan tampilkan service/characteristic GATT |
| `features` | Uji primitive ESC/POS yang didukung printer (teks, font, raster, barcode) |
| `devices` | Daftar profil printer tersimpan |
| `web` | UI browser: form, import, pratinjau langsung, cetak |
| `import` | Cetak PDF/PNG sebagai gambar, tanpa digambar ulang |
| `print` | Render lalu cetak |
| `export` | Tulis byte ESC/POS ke file |
| `selftest` | Cetak halaman diagnostik |
| `raw` | Kirim file `.escpos`/`.bin` yang sudah jadi |
| `config` | Lihat/ubah pengaturan tersimpan |

## Sumber input

Pilih satu; flag lebih dulu dari file, dan file boleh diulang.

```bash
resi print --file label.pdf          # teks & garis diambil dari PDF
resi print --file label.json         # objek label terstruktur
resi print --file catatan.txt        # label hasil salin dari seller centre
resi print --text "SPXID0..."        # teks langsung
resi print                           # form interaktif
```

Format teks memakai label yang sama dengan yang dicetak:

```
SPXID065670267489
Penerima: Edwin suryo laksono
Alamat: Perumnas bumitelukjambe blok j no 333 Rt 02 Rw
HP: 081234567890
Pengirim: zera
Alamat: KAB. KLATEN
Berat: 800 gr
Batas Kirim: 28-09-2026
No.Pesanan: 26092754QH0FXM
1x Cover Tutup Knalpot Vario 125
2x Baut Extra
```

## Opsi cetak

```
--device <mac|id>    printer tujuan (default: perangkat tersimpan)
--paper <58|80>      lebar kertas
--code-page <n>      ESC t: 0=CP437, 2=CP850, 19=CP858
--module-width <n>   lebar modul barcode
--barcode-layout <l> penempatan barcode atas/bawah: auto | across | stack
--qr <text>          isi QR (default: nomor resi)
--no-qr              tanpa QR
--cut <partial|full> mode potong kertas, --no-cut untuk menonaktifkan
--notes "<text>"     baris tambahan sebelum potong
--dry-run            tampilkan hasil tanpa mencetak
--write-uuid <uuid>  override characteristic untuk menulis data
--yes                tidak/Ask konfirmasi
```

## Layout barcode atas & bawah

Label asli mengulang nomor resi tiga kali di baris atas dan tiga kali di bawah.
Tiga simbol CODE128 untuk `SPXID065670267489` memakai 167 modul, sehingga tiga
satuannya butuh 501 dot pada modul 1 dot — 62mm, lebih lebar dari kepala 58mm.
Ketika tidak muat, ketiga simbol **ditumpuk** (`--barcode-layout stack`, atau
`auto`) alih-alih dipipihkan jadi tidak bisa discan. Di 80mm ketiganya muat
berdampingan. Meminta `across` pada kertas yang tidak cukup akan otomatis turun ke
mode stack dan memberi peringatan, bukan menulis melewati tepi kertas.

## Arsitektur

```
bin/resi.mjs            parsing argumen dan routing perintah
src/label/pdf.mjs       ekstraksi teks + koordinat dari PDF (pdfjs-dist)
src/label/parse.mjs     teks/kotak -> objek label (resi, penerima, pengirim, item)
src/label/frame.mjs     geometri asli label sebagai proporsi
src/render/plan.mjs     objek label -> rencana gambar (grid 24 dot per baris)
src/render/planescpos.mjs  rencana -> byte ESC/POS (raster + teks)
src/render/planascii.mjs   rencana -> pratinjau terminal
src/render/plansvg.mjs     rencana -> pratinjau SVG untuk browser
src/render/png.mjs         decoder/encoder PNG tanpa dependency native
src/render/raster.mjs      pangkas, scale, dither, 1 bit/dot -> GS v 0
src/commands/import.mjs    cetak PDF/PNG apa adanya
src/commands/web.mjs       server HTTP untuk UI browser
src/commands/webui.mjs     markup + script UI
src/escpos/barcode.mjs  encoder CODE128 perangkat lunak
src/escpos/builder.mjs  primitive ESC/POS
src/escpos/qr.mjs       matriks QR
src/ble/scan.mjs        discovering/pemetaan perangkat (noble)
src/ble/connect.mjs     koneksi, GATT discovery, tulis terpotong
```

Tinggi label mengikuti sel baris 24 dot milik printer, bukan rasio aspek lembar
asli, supaya posisi garis tidak meleset antar lebar kertas.

## Profil printer

`scan` lalu `print` menyimpan profil ke `profiles/<nama>.json` berisi alamat dan
characteristic tulis. Periferal ditemukan berdasarkan nama bila UUID berubah
antar restart. Ganti characteristic tulis dengan `--write-uuid` bila berbeda.

## Pengembangan

```bash
bun test        # 52 test: barcode, plan, batas kertas, parser, PNG, raster, GS v 0
bun run web     # buka UI browser
bun run scan
bun run preview
bun run selftest
```

Printer yang sudah diuji: RPP02N dengan kertas 80mm (area cetak 576 dot). Printer ini **tidak** merender barcode
lewat `GS k`, jadi barcode CODE128 dihitung sendiri dan dikirim sebagai raster.
Jalankan `resi features` untuk memeriksa kemampuan printer lain.
