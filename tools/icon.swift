// icon.swift — generates the Mole GUI app icon.
//
// Standalone AppKit command-line program. No arguments, no network, no GUI session:
//
//   swiftc -O tools/icon.swift -o /tmp/mole-icon-gen
//   /tmp/mole-icon-gen
//
// It draws a 1024x1024 master design with Core Graphics (resolution independent),
// renders each iconset variant natively at its exact pixel size so small sizes stay
// crisp, writes build/AppIcon.iconset/, and then calls
// `/usr/bin/iconutil -c icns build/AppIcon.iconset -o build/AppIcon.icns`.
//
// Run it from the repository root (or keep the compiled binary's source path intact);
// the script locates the repo by walking up from the working directory looking for
// `SPEC.md`.

import AppKit
import CoreGraphics
import Foundation

// MARK: - Design constants (all units are 1024-canvas design units)

private let canvasSize: CGFloat = 1024
private let iconInset: CGFloat = 100
private let cornerRatio: CGFloat = 0.2237

// MARK: - Color helpers

private func rgb(_ r: Int, _ g: Int, _ b: Int, _ a: CGFloat = 1.0) -> CGColor {
    return CGColor(
        srgbRed: CGFloat(r) / 255.0,
        green: CGFloat(g) / 255.0,
        blue: CGFloat(b) / 255.0,
        alpha: a
    )
}

private let sRGB = CGColorSpace(name: CGColorSpace.sRGB)

private func linearGradient(
    _ colors: [CGColor],
    _ locations: [CGFloat]
) -> CGGradient? {
    guard let space = sRGB else { return nil }
    return CGGradient(colorsSpace: space, colors: colors as CFArray, locations: locations)
}

private func radialGradient(
    _ colors: [CGColor],
    _ locations: [CGFloat]
) -> CGGradient? {
    guard let space = sRGB else { return nil }
    return CGGradient(colorsSpace: space, colors: colors as CFArray, locations: locations)
}

// MARK: - Geometry

private func roundedRectPath(rect: CGRect, radius: CGFloat) -> CGPath {
    return CGPath(
        roundedRect: rect,
        cornerWidth: radius,
        cornerHeight: radius,
        transform: nil
    )
}

/// Bold geometric "M" monogram.
///
/// The outline is the SF Pro Black "M" glyph, normalized once to a 336-unit-tall
/// mark centered on the origin. Hardcoding the outline keeps the generator
/// independent of which fonts the build machine happens to expose while still
/// giving a true type-grade M (flat top, even diagonals, clean V).
private let monogramOutline: [CGPoint] = [
    CGPoint(x: -189.19, y: -168.00),
    CGPoint(x: -189.19, y: 168.00),
    CGPoint(x: -75.09, y: 168.00),
    CGPoint(x: -0.81, y: -32.02),
    CGPoint(x: 0.81, y: -32.02),
    CGPoint(x: 75.09, y: 168.00),
    CGPoint(x: 189.19, y: 168.00),
    CGPoint(x: 189.19, y: -168.00),
    CGPoint(x: 103.04, y: -168.00),
    CGPoint(x: 103.04, y: 26.66),
    CGPoint(x: 57.16, y: 26.66),
    CGPoint(x: 152.40, y: 158.69),
    CGPoint(x: 26.43, y: -168.00),
    CGPoint(x: -26.43, y: -168.00),
    CGPoint(x: -152.40, y: 158.69),
    CGPoint(x: -57.16, y: 26.66),
    CGPoint(x: -103.04, y: 26.66),
    CGPoint(x: -103.04, y: -168.00),
]

private func monogramPath(center: CGPoint) -> CGPath {
    let path = CGMutablePath()
    for (index, point) in monogramOutline.enumerated() {
        let translated = CGPoint(x: center.x + point.x, y: center.y + point.y)
        if index == 0 {
            path.move(to: translated)
        } else {
            path.addLine(to: translated)
        }
    }
    path.closeSubpath()
    return path
}

// MARK: - Drawing

private func drawIcon(in ctx: CGContext, size: Int) {
    let scale = CGFloat(size) / canvasSize

    let content = CGRect(
        x: iconInset,
        y: iconInset,
        width: canvasSize - iconInset * 2,
        height: canvasSize - iconInset * 2
    )
    let radius = content.width * cornerRatio
    let silhouette = roundedRectPath(rect: content, radius: radius)

    // --- Dark rounded-square base with a violet/indigo radial glow ---
    ctx.saveGState()
    ctx.addPath(silhouette)
    ctx.clip()

    let baseTop = rgb(30, 22, 48)
    let baseMiddle = rgb(17, 13, 28)
    let baseBottom = rgb(7, 6, 14)
    if let gradient = linearGradient(
        [baseTop, baseMiddle, baseBottom],
        [0.0, 0.55, 1.0]
    ) {
        ctx.drawLinearGradient(
            gradient,
            start: CGPoint(x: content.midX, y: content.maxY),
            end: CGPoint(x: content.midX, y: content.minY),
            options: []
        )
    }

    ctx.setBlendMode(.plusLighter)

        // Primary purple glow, upper-left of center.
        if let glow = radialGradient(
            [rgb(139, 92, 246, 0.52), rgb(139, 92, 246, 0.0)],
            [0.0, 1.0]
        ) {
            let center = CGPoint(
                x: content.minX + content.width * 0.36,
                y: content.minY + content.height * 0.65
            )
            ctx.drawRadialGradient(
                glow,
                startCenter: center,
                startRadius: 0,
                endCenter: center,
                endRadius: content.width * 0.74,
                options: []
            )
        }

        // Indigo counter-glow, lower-right, keeps the field from looking flat.
        if let glow = radialGradient(
            [rgb(79, 70, 229, 0.38), rgb(79, 70, 229, 0.0)],
            [0.0, 1.0]
        ) {
            let center = CGPoint(
                x: content.minX + content.width * 0.78,
                y: content.minY + content.height * 0.24
            )
            ctx.drawRadialGradient(
                glow,
                startCenter: center,
                startRadius: 0,
                endCenter: center,
                endRadius: content.width * 0.6,
                options: []
            )
        }

    ctx.setBlendMode(.normal)

    // Soft inner highlight across the top of the tile.
    let sheenTop = CGPoint(x: content.midX, y: content.maxY)
    let sheenBottom = CGPoint(x: content.midX, y: content.minY + content.height * 0.52)
    if let sheen = linearGradient(
        [rgb(255, 255, 255, 0.15), rgb(255, 255, 255, 0.03), rgb(255, 255, 255, 0.0)],
        [0.0, 0.55, 1.0]
    ) {
        ctx.saveGState()
        ctx.clip(to: CGRect(
            x: content.minX,
            y: content.height * 0.52 + content.minY,
            width: content.width,
            height: content.height * 0.48
        ))
        ctx.drawLinearGradient(sheen, start: sheenTop, end: sheenBottom, options: [])
        ctx.restoreGState()
    }

    ctx.restoreGState()

    // --- Inner rim: bright top edge fading into a quiet bottom edge ---
    ctx.saveGState()
    ctx.addPath(silhouette)
    ctx.clip()

    let rimWidth = max(2.0, 0.55 / max(scale, 0.0001))
    let rimInset = rimWidth / 2
    let rimRect = content.insetBy(dx: rimInset, dy: rimInset)
    let rimPath = roundedRectPath(
        rect: rimRect,
        radius: max(radius - rimInset, 1)
    )

    ctx.saveGState()
    ctx.addPath(rimPath)
    ctx.setLineWidth(rimWidth)
    ctx.replacePathWithStrokedPath()
    ctx.clip()
    if let rim = linearGradient(
        [rgb(255, 255, 255, 0.42), rgb(255, 255, 255, 0.10), rgb(255, 255, 255, 0.02)],
        [0.0, 0.45, 1.0]
    ) {
        ctx.drawLinearGradient(rim, start: sheenTopPoint(content), end: sheenBottomPoint(content), options: [])
    }
    ctx.restoreGState()

    ctx.restoreGState()

    // --- Monogram ---
    let markCenter = CGPoint(x: content.midX, y: content.midY + 6)

    // Violet bloom behind the mark, then the mark itself with a white/lilac
    // vertical gradient so it reads as a soft light source.
    ctx.saveGState()
    ctx.setShadow(
        offset: .zero,
        blur: 92,
        color: rgb(139, 92, 246, 0.55)
    )
    ctx.addPath(monogramPath(center: markCenter))
    ctx.setFillColor(rgb(236, 231, 255, 0.9))
    ctx.fillPath()
    ctx.restoreGState()

    ctx.saveGState()
    ctx.addPath(monogramPath(center: markCenter))
    ctx.clip()
    if let mark = linearGradient(
        [rgb(255, 255, 255, 1.0), rgb(244, 241, 255, 1.0), rgb(196, 181, 253, 1.0)],
        [0.0, 0.62, 1.0]
    ) {
        let markRect = CGRect(
            x: markCenter.x - 260,
            y: markCenter.y - 210,
            width: 520,
            height: 420
        )
        ctx.drawLinearGradient(
            mark,
            start: CGPoint(x: markRect.midX, y: markRect.maxY),
            end: CGPoint(x: markRect.midX, y: markRect.minY),
            options: []
        )
    }
    ctx.restoreGState()
}

private func sheenTopPoint(_ content: CGRect) -> CGPoint {
    return CGPoint(x: content.midX, y: content.maxY)
}

private func sheenBottomPoint(_ content: CGRect) -> CGPoint {
    return CGPoint(x: content.midX, y: content.minY)
}

// MARK: - Rendering

private func renderIcon(size: Int) -> CGImage {
    guard let space = sRGB,
          let ctx = CGContext(
              data: nil,
              width: size,
              height: size,
              bitsPerComponent: 8,
              bytesPerRow: 0,
              space: space,
              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
          ) else {
        fail("could not create a \(size)x\(size) bitmap context")
    }

    ctx.setShouldAntialias(true)
    ctx.setAllowsAntialiasing(true)
    ctx.interpolationQuality = .high
    ctx.scaleBy(x: CGFloat(size) / canvasSize, y: CGFloat(size) / canvasSize)
    drawIcon(in: ctx, size: size)

    guard let image = ctx.makeImage() else {
        fail("could not snapshot the \(size)x\(size) icon")
    }
    return image
}

private func pngData(for image: CGImage) -> Data? {
    let rep = NSBitmapImageRep(cgImage: image)
    rep.size = NSSize(width: image.width, height: image.height)
    return rep.representation(using: .png, properties: [:])
}

// MARK: - Filesystem

private func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data("icon: error: \(message)\n".utf8))
    exit(1)
}

private func note(_ message: String) {
    print("icon: \(message)")
}

private func findRepoRoot() -> URL? {
    let fileManager = FileManager.default
    var seeds: [URL] = [URL(fileURLWithPath: fileManager.currentDirectoryPath)]
    seeds.append(
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // tools
            .deletingLastPathComponent()   // repo root
    )

    for var directory in seeds {
        for _ in 0..<8 {
            if fileManager.fileExists(atPath: directory.appendingPathComponent("SPEC.md").path) {
                return directory
            }
            let parent = directory.deletingLastPathComponent()
            if parent.path == directory.path { break }
            directory = parent
        }
    }
    return nil
}

/// Removes only our own generated iconset before regenerating. The path is resolved
/// from the repo root and asserted to end in `build/AppIcon.iconset`, so a wrong
/// working directory can never delete anything else.
private func resetIconsetset(_ iconset: URL) {
    let fileManager = FileManager.default
    guard iconset.lastPathComponent == "AppIcon.iconset",
          iconset.deletingLastPathComponent().lastPathComponent == "build",
          fileManager.fileExists(atPath: iconset.path) else {
        return
    }
    do {
        try fileManager.removeItem(at: iconset)
    } catch {
        fail("could not remove the old iconset at \(iconset.path): \(error.localizedDescription)")
    }
}

// MARK: - iconutil

private func runIconutil(iconset: URL, output: URL) {
    guard FileManager.default.isExecutableFile(atPath: "/usr/bin/iconutil") else {
        fail("/usr/bin/iconutil is missing; it ships with the macOS Command Line Tools")
    }

    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
    process.arguments = ["-c", "icns", iconset.path, "-o", output.path]

    let pipe = Pipe()
    process.standardOutput = pipe
    process.standardError = pipe

    do {
        try process.run()
    } catch {
        fail("could not launch iconutil: \(error.localizedDescription)")
    }
    process.waitUntilExit()

    let log = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
    if process.terminationStatus != 0 {
        let detail = log.trimmingCharacters(in: .whitespacesAndNewlines)
        fail("iconutil failed (status \(process.terminationStatus))\(detail.isEmpty ? "" : ": \(detail)")")
    }
}

// MARK: - Main

private struct Iconslot {
    let name: String
    let pixels: Int
}

private let iconsetSlots: [Iconslot] = [
    Iconslot(name: "icon_16x16.png", pixels: 16),
    Iconslot(name: "icon_16x16@2x.png", pixels: 32),
    Iconslot(name: "icon_32x32.png", pixels: 32),
    Iconslot(name: "icon_32x32@2x.png", pixels: 64),
    Iconslot(name: "icon_128x128.png", pixels: 128),
    Iconslot(name: "icon_128x128@2x.png", pixels: 256),
    Iconslot(name: "icon_256x256.png", pixels: 256),
    Iconslot(name: "icon_256x256@2x.png", pixels: 512),
    Iconslot(name: "icon_512x512.png", pixels: 512),
    Iconslot(name: "icon_512x512@2x.png", pixels: 1024),
]

let fileManager = FileManager.default

guard let repoRoot = findRepoRoot() else {
    fail("could not find the Mole GUI repo root; run this from the repo root (needs SPEC.md)")
}

let buildDir = repoRoot.appendingPathComponent("build", isDirectory: true)
let iconset = buildDir.appendingPathComponent("AppIcon.iconset", isDirectory: true)
let icns = buildDir.appendingPathComponent("AppIcon.icns")

do {
    try fileManager.createDirectory(at: buildDir, withIntermediateDirectories: true)
} catch {
    fail("could not create \(buildDir.path): \(error.localizedDescription)")
}

resetIconsetset(iconset)
do {
    try fileManager.createDirectory(at: iconset, withIntermediateDirectories: true)
} catch {
    fail("could not create \(iconset.path): \(error.localizedDescription)")
}

// The same pixel size is shared by two slots (32, 256), so render each size once.
var cache: [Int: CGImage] = [:]
var totalBytes = 0

for slot in iconsetSlots {
    let image: CGImage
    if let cached = cache[slot.pixels] {
        image = cached
    } else {
        image = renderIcon(size: slot.pixels)
        cache[slot.pixels] = image
    }

    guard let data = pngData(for: image), !data.isEmpty else {
        fail("could not encode \(slot.name) as PNG")
    }

    let destination = iconset.appendingPathComponent(slot.name)
    do {
        try data.write(to: destination, options: .atomic)
    } catch {
        fail("could not write \(destination.path): \(error.localizedDescription)")
    }
    totalBytes += data.count
    note("wrote \(slot.name) (\(slot.pixels)px, \(data.count) bytes)")
}

// Remove a stale icns first so a failed iconutil can never leave a misleading file.
if fileManager.fileExists(atPath: icns.path) {
    do {
        try fileManager.removeItem(at: icns)
    } catch {
        fail("could not remove the old \(icns.path): \(error.localizedDescription)")
    }
}

runIconutil(iconset: iconset, output: icns)

guard fileManager.fileExists(atPath: icns.path) else {
    fail("iconutil reported success but \(icns.path) does not exist")
}
var icnsSize = 0
if let attributes = try? fileManager.attributesOfItem(atPath: icns.path),
   let size = attributes[.size] as? Int {
    icnsSize = size
}
guard icnsSize > 0 else {
    fail("\(icns.path) is empty")
}

note("iconset: \(iconset.path) (\(iconsetSlots.count) PNGs, \(totalBytes) bytes)")
note("icns:    \(icns.path) (\(icnsSize) bytes)")
print("icon: ok")
