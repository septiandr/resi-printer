export function usage() {
  return `resi - print Shopee Xpress (SPX) resi labels on an ESC/POS thermal printer over Bluetooth

USAGE
  resi <command> [options] [files...]

COMMANDS
  scan                 Find Bluetooth Low Energy peripherals
  probe                Connect and list a printer's GATT services/characteristics
  devices              List saved printer profiles
  print                Render a label and print it
  import               Print a PDF/PNG as a picture, without redrawing it
  web                 Open the browser UI (form + import + live preview + print)
  preview              Render a label in the terminal without printing
  export               Write the ESC/POS bytes to a file
  selftest             Print a diagnostic test page
  raw                  Send an existing .escpos/.bin file to the printer
  config               Show or change saved settings

INPUT SOURCES (pick one; flags beat files)
  --file <path>        A .pdf, .json or .txt label
  --text "<label>"     Label text pasted from the seller centre
  (no flag)            Interactive form
  files...             Same as --file, repeatable

PRINTING OPTIONS
  --device <mac|id>    Target printer. Defaults to the saved device
  --paper <58|80>      Paper width. Defaults to the saved setting
  --cols <n>           Override the character column count
  --code-page <n>      ESC t code page (0 = CP437, 2 = CP850, 19 = CP858)
  --module-width <n>   Barcode module width, 2-6
  --barcode-layout <l> Top/bottom barcode placement: auto (default), across, stack
  --qr <text>          QR payload (defaults to the tracking number)
  --no-qr              Do not print a QR code
  --cut <partial|full> Paper cut mode
  --no-cut             Do not issue a cut command
  --no-cut-line        Do not print a cutting guide line at the bottom
  --notes "<text>"     Extra line printed before the cut
  --port <n>           Port for the web UI (default 8137)
  --no-open            Do not open a browser for the web UI

IMPORT OPTIONS (resi import)
  --dpi <n>            Rasterise a PDF at about this resolution. Default 450
  --dither             Ordered dithering, for faint grey artwork
  --threshold <0-255>  Darker than this burns a dot. Default 128
  --invert             Print light areas dark
  --no-trim            Keep the page's white margin instead of cropping to ink
  --margin <n>         Dots of white to keep around the artwork. Default 3
  --bottom <mm>        Bottom margin in mm before the cut line. Default 5
  --scale <pct>        Print at this size instead of filling the paper width
  --probe-width        Print a dot ruler to measure the real print head
  --write-uuid <uuid>  Override the characteristic used to send data
  --tracking <text>    selftest: tracking number encoded in the test barcode
  --timeout <ms>       Connect/probe timeout
  --dry-run            Show what would be printed, do not print
  --yes                Do not ask for confirmation

BLE OPTIONS
  --save <name>        Save the probed printer as a profile
  --filter <text>      scan: only show peripherals whose name contains this

EXAMPLES
  resi scan
  resi probe --device 86:67:7A:52:01:3A --save rpp02n
  resi preview --file assets/resi.pdf
  resi print --file assets/resi.pdf
  resi print --text "SPXID065670267489" 
  resi print labels.json
  resi print --device rpp02n --paper 80 --no-qr
  resi import assets/resi.pdf
  resi import label.png --dither --threshold 160
  resi import assets/resi.pdf --probe-width
`;
}
