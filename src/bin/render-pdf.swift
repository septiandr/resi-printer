import Foundation
import PDFKit
import AppKit

guard CommandLine.arguments.count > 2 else {
    fputs("Usage: render-pdf <pdf-file> <out-dir> [dpi]\n", stderr)
    exit(1)
}

let pdfPath = CommandLine.arguments[1]
let outDir = CommandLine.arguments[2]
let dpi: CGFloat = CommandLine.arguments.count > 3 ? CGFloat(Double(CommandLine.arguments[3]) ?? 450) : 450

try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true, attributes: nil)

guard let doc = PDFDocument(url: URL(fileURLWithPath: pdfPath)) else {
    fputs("Error: Cannot open PDF at \(pdfPath)\n", stderr)
    exit(1)
}

let count = doc.pageCount
if count == 0 {
    fputs("Error: PDF has 0 pages\n", stderr)
    exit(1)
}

for i in 0..<count {
    guard let page = doc.page(at: i) else { continue }
    let bounds = page.bounds(for: .cropBox)
    let longPt = max(bounds.width, bounds.height)
    let size = min(4000.0, max(600.0, round(longPt * dpi / 72.0)))
    let thumb = page.thumbnail(of: NSSize(width: size, height: size), for: .cropBox)
    
    guard let tiff = thumb.tiffRepresentation,
          let rep = NSBitmapImageRep(data: tiff),
          let png = rep.representation(using: .png, properties: [:]) else {
        fputs("Error: Failed to render page \(i + 1)\n", stderr)
        continue
    }
    
    let padIndex = String(format: "%04d", i + 1)
    let outPath = "\(outDir)/page-\(padIndex).png"
    do {
        try png.write(to: URL(fileURLWithPath: outPath))
    } catch {
        fputs("Error: Failed to write \(outPath): \(error)\n", stderr)
    }
}

