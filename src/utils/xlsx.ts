/**
 * Minimal XLSX (Office Open XML SpreadsheetML) writer.
 * Produces a valid .xlsx Blob without any external dependencies.
 * Supports string and number cell types, multiple sheets, and column widths.
 */

// ─── ZIP helpers (using fflate which is bundled with jspdf) ─────────────────
// We avoid fflate and instead build the ZIP manually using the DEFLATE-store
// method (no compression) since the built-in CompressionStream API isn't
// available in all WebViews. Instead we use a tiny synchronous CRC-32 + ZIP
// builder that is fully self-contained.

function crc32(buf: Uint8Array): number {
	const table = makeCrcTable();
	let crc = 0xffffffff;
	for (let i = 0; i < buf.length; i++) {
		crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
	}
	return (crc ^ 0xffffffff) >>> 0;
}

let _crcTable: Uint32Array | null = null;
function makeCrcTable(): Uint32Array {
	if (_crcTable) return _crcTable;
	_crcTable = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		_crcTable[n] = c;
	}
	return _crcTable;
}

function u16le(v: number): Uint8Array {
	return new Uint8Array([v & 0xff, (v >> 8) & 0xff]);
}
function u32le(v: number): Uint8Array {
	return new Uint8Array([
		v & 0xff,
		(v >> 8) & 0xff,
		(v >> 16) & 0xff,
		(v >> 24) & 0xff,
	]);
}

function encodeUtf8(s: string): Uint8Array {
	return new TextEncoder().encode(s);
}

function concat(...arrays: Uint8Array[]): Uint8Array {
	const len = arrays.reduce((s, a) => s + a.length, 0);
	const out = new Uint8Array(len);
	let off = 0;
	for (const a of arrays) {
		out.set(a, off);
		off += a.length;
	}
	return out;
}

interface ZipEntry {
	name: string;
	data: Uint8Array;
}

function buildZip(entries: ZipEntry[]): Uint8Array {
	const localHeaders: Uint8Array[] = [];
	const centralDirs: Uint8Array[] = [];
	let offset = 0;

	for (const entry of entries) {
		const nameBytes = encodeUtf8(entry.name);
		const crc = crc32(entry.data);
		const size = entry.data.length;

		// Local file header
		const lh = concat(
			new Uint8Array([0x50, 0x4b, 0x03, 0x04]), // signature
			u16le(20), // version needed
			u16le(0), // flags
			u16le(0), // compression (store)
			u16le(0), // mod time
			u16le(0), // mod date
			u32le(crc),
			u32le(size),
			u32le(size),
			u16le(nameBytes.length),
			u16le(0), // extra length
			nameBytes,
		);

		localHeaders.push(concat(lh, entry.data));

		// Central directory entry
		const cd = concat(
			new Uint8Array([0x50, 0x4b, 0x01, 0x02]), // signature
			u16le(20), // version made by
			u16le(20), // version needed
			u16le(0), // flags
			u16le(0), // compression
			u16le(0), // mod time
			u16le(0), // mod date
			u32le(crc),
			u32le(size),
			u32le(size),
			u16le(nameBytes.length),
			u16le(0), // extra
			u16le(0), // comment
			u16le(0), // disk start
			u16le(0), // int attr
			u32le(0), // ext attr
			u32le(offset),
			nameBytes,
		);

		centralDirs.push(cd);
		offset += lh.length + size;
	}

	const centralDir = concat(...centralDirs);
	const eocd = concat(
		new Uint8Array([0x50, 0x4b, 0x05, 0x06]),
		u16le(0),
		u16le(0),
		u16le(entries.length),
		u16le(entries.length),
		u32le(centralDir.length),
		u32le(offset),
		u16le(0),
	);

	return concat(...localHeaders, centralDir, eocd);
}

// ─── XLSX sheet builder ─────────────────────────────────────────────────────

export interface XlsxSheetDef {
	name: string;
	rows: (string | number | null)[][];
	colWidths?: number[]; // in characters
}

function escapeXml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

function colLetter(col: number): string {
	let s = "";
	let c = col + 1;
	while (c > 0) {
		const rem = (c - 1) % 26;
		s = String.fromCharCode(65 + rem) + s;
		c = Math.floor((c - 1) / 26);
	}
	return s;
}

function buildSheet(sheet: XlsxSheetDef): Uint8Array {
	const rows: string[] = [];
	for (let r = 0; r < sheet.rows.length; r++) {
		const row = sheet.rows[r];
		const cells: string[] = [];
		for (let c = 0; c < row.length; c++) {
			const val = row[c];
			const ref = `${colLetter(c)}${r + 1}`;
			if (val === null || val === undefined) continue;
			if (typeof val === "number") {
				cells.push(`<c r="${ref}"><v>${val}</v></c>`);
			} else {
				cells.push(
					`<c r="${ref}" t="inlineStr"><is><t>${escapeXml(String(val))}</t></is></c>`,
				);
			}
		}
		rows.push(`<row r="${r + 1}">${cells.join("")}</row>`);
	}

	let colsDef = "";
	if (sheet.colWidths && sheet.colWidths.length > 0) {
		const colElems = sheet.colWidths
			.map(
				(w, i) =>
					`<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`,
			)
			.join("");
		colsDef = `<cols>${colElems}</cols>`;
	}

	const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
${colsDef}
<sheetData>${rows.join("")}</sheetData>
</worksheet>`;
	return encodeUtf8(xml);
}

export function buildXlsxBlob(sheets: XlsxSheetDef[]): Blob {
	const entries: ZipEntry[] = [];

	// [Content_Types].xml
	const sheetContentTypes = sheets
		.map(
			(_, i) =>
				`<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
		)
		.join("");
	entries.push({
		name: "[Content_Types].xml",
		data: encodeUtf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${sheetContentTypes}
</Types>`),
	});

	// _rels/.rels
	entries.push({
		name: "_rels/.rels",
		data: encodeUtf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
	});

	// xl/workbook.xml
	const sheetXml = sheets
		.map(
			(s, i) =>
				`<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
		)
		.join("");
	entries.push({
		name: "xl/workbook.xml",
		data: encodeUtf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheetXml}</sheets>
</workbook>`),
	});

	// xl/_rels/workbook.xml.rels
	const wbRels = sheets
		.map(
			(_, i) =>
				`<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
		)
		.join("");
	entries.push({
		name: "xl/_rels/workbook.xml.rels",
		data: encodeUtf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${wbRels}
</Relationships>`),
	});

	// xl/worksheets/sheetN.xml
	for (let i = 0; i < sheets.length; i++) {
		entries.push({
			name: `xl/worksheets/sheet${i + 1}.xml`,
			data: buildSheet(sheets[i]),
		});
	}

	const zip = buildZip(entries);
	return new Blob([zip], {
		type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	});
}
