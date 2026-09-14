/**
 * Composite coordinates are expressed in the template's own pixel space.
 * Every template is normalised to 4000px wide before compositing, so a layout
 * is valid for any template that shares its design.
 */
export interface CertificateLayout {
    /** Templates that already print the course name in their body copy set this to null. */
    courseTitle: { top: number; fontSize: number; color: string } | null;
    recipientName: { top: number; fontSize: number; color: string };
    certNumber: { top: number; left: number; fontSize: number; color: string } | null;
    qr: { top: number; left: number; size: number };
}

/** Layout for the 2024 gold-wave templates. The course title sits on its own line under the name. */
export const GOLD_WAVE_LAYOUT: CertificateLayout = {
    courseTitle: { top: 1555, fontSize: 65, color: '#333333' },
    recipientName: { top: 1280, fontSize: 200, color: '#000000' },
    certNumber: { top: 2410, left: 866, fontSize: 48, color: '#000000' },
    qr: { top: 2806, left: 140, size: 264 },
};

/** Layout for the original template, which leaves the course name blank. */
export const LEGACY_LAYOUT: CertificateLayout = {
    courseTitle: { top: 1520, fontSize: 65, color: '#333333' },
    recipientName: { top: 1280, fontSize: 200, color: '#000000' },
    certNumber: null,
    qr: { top: 2750, left: 120, size: 320 },
};

const LEGACY_TEMPLATES = new Set(['certificate.png']);

export function layoutForTemplate(templatePath: string): CertificateLayout {
    const fileName = templatePath.split(/[\/]/).pop()?.toLowerCase() ?? '';
    return LEGACY_TEMPLATES.has(fileName) ? LEGACY_LAYOUT : GOLD_WAVE_LAYOUT;
}
