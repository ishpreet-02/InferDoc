import PDFDocument from "pdfkit";
import { createWriteStream } from "node:fs";

/**
 * Structured manual content. Used to (a) render a real multi-page PDF into
 * /public/manuals and (b) produce plain `extractedText` we can later push into
 * Moss for semantic retrieval (Phase 2).
 */
export interface ManualIssue {
  symptom: string;
  causes: string[];
  fix: string;
}

export interface ManualMaintenanceRow {
  task: string;
  interval: string;
  notes: string;
}

export interface Manual {
  slug: string;
  productName: string;
  title: string;
  overview: string;
  components: string[];
  commonIssues: ManualIssue[];
  maintenance: ManualMaintenanceRow[];
}

export const MANUALS: Manual[] = [
  {
    slug: "acme-escooter-x1",
    productName: "Acme E-Scooter X1",
    title: "Service Manual",
    overview:
      "The Acme E-Scooter X1 is a 36V lithium-ion electric scooter with a 350W brushless hub motor, rated for a 25 km range. This manual covers the electrical system, braking, and routine service. Always power off and remove the key before opening any panel.",
    components: [
      "Front panel — houses the fuse block, headlight wiring, and display ribbon connector.",
      "Fuse F3 (10A), beneath front panel, Figure 4.2 — protects the headlight and display circuit.",
      "Main controller (located in the deck) — drives the hub motor and reads the throttle Hall sensor.",
      "36V 7.8Ah battery pack — under the footboard, secured by four M4 screws.",
      "Throttle assembly — Hall-effect twist grip wired to the controller via a 3-pin JST connector.",
      "Rear disc brake with electronic cutoff switch that disables the motor when the lever is pulled.",
    ],
    commonIssues: [
      {
        symptom: "Scooter powers on but headlight and display are dead.",
        causes: [
          "Blown Fuse F3 (10A) beneath the front panel (Figure 4.2).",
          "Loose display ribbon connector at the front panel.",
        ],
        fix: "Open the front panel, inspect Fuse F3. If the filament is broken or glass is darkened, replace with a 10A automotive blade fuse. Reseat the display ribbon connector. Do not bypass the fuse with foil.",
      },
      {
        symptom: "Motor does not spin when throttle is applied, no error code.",
        causes: [
          "Brake cutoff switch stuck engaged (motor inhibited).",
          "Throttle Hall connector unplugged at the controller.",
        ],
        fix: "Check that the brake lever returns fully; a stuck cutoff switch keeps the motor disabled. Reseat the 3-pin throttle connector at the controller. Verify 4.2V on the throttle signal wire at rest.",
      },
      {
        symptom: "Range dropped sharply and scooter shuts off under load.",
        causes: [
          "Aged or unbalanced 36V battery pack.",
          "Loose battery main connector causing voltage sag.",
        ],
        fix: "Charge to full, then measure resting pack voltage (should be ~42V full). If it sags below 30V under throttle, the pack needs balancing or replacement. Retorque the main battery connector.",
      },
    ],
    maintenance: [
      { task: "Replace / inspect front Fuse F3", interval: "Every 6 months", notes: "10A blade fuse, beneath front panel (Fig 4.2)." },
      { task: "Brake pad inspection and adjustment", interval: "Every 3 months", notes: "Replace pads below 2mm." },
      { task: "Tire pressure check", interval: "Monthly", notes: "Maintain 45 PSI front and rear." },
      { task: "Battery balance charge", interval: "Every 6 months", notes: "Leave on charger 2h past full." },
    ],
  },
  {
    slug: "acme-water-purifier-w3",
    productName: "Acme Water Purifier W3",
    title: "Service Manual",
    overview:
      "The Acme Water Purifier W3 is a 4-stage RO + UV countertop purifier with a 1.2L pressure tank. This manual covers the filter stages, UV lamp, and pump. Disconnect power and close the inlet valve before any service.",
    components: [
      "Stage 1 — sediment pre-filter (PP spun, 5 micron).",
      "Stage 2 — activated carbon block, removes chlorine and odor.",
      "Stage 3 — RO membrane (75 GPD), the core purification element.",
      "Stage 4 — UV sterilization lamp with ballast and flow sensor.",
      "Booster pump — raises inlet pressure for the RO membrane.",
      "Solenoid inlet valve and low-pressure switch.",
    ],
    commonIssues: [
      {
        symptom: "Purifier produces little or no water.",
        causes: [
          "Clogged Stage 1 sediment filter.",
          "Low inlet pressure tripping the low-pressure switch.",
          "Failed booster pump.",
        ],
        fix: "Replace the sediment pre-filter if discolored. Confirm inlet pressure above 5 PSI. If the pump is silent when the tank is empty, test the pump for 24V at its terminals; replace if dead.",
      },
      {
        symptom: "UV indicator is red / alarm beeping.",
        causes: [
          "UV lamp at end of life (8000-hour rating).",
          "Flow sensor not detecting flow.",
        ],
        fix: "Replace the UV lamp and reset the hour counter. If the alarm persists with flow, inspect the flow sensor wiring to the ballast.",
      },
      {
        symptom: "Water tastes off or has odor.",
        causes: [
          "Exhausted carbon block (Stage 2).",
          "RO membrane fouled.",
        ],
        fix: "Replace the carbon block. If TDS out is above 50 ppm, replace the RO membrane and sanitize the tank.",
      },
    ],
    maintenance: [
      { task: "Replace sediment + carbon pre-filters", interval: "Every 6 months", notes: "Stages 1 and 2." },
      { task: "Replace RO membrane", interval: "Every 24 months", notes: "Sooner if feed TDS is high." },
      { task: "Replace UV lamp", interval: "Every 12 months", notes: "Rated 8000 hours." },
      { task: "Sanitize tank and lines", interval: "Every 6 months", notes: "Use food-grade sanitizer." },
    ],
  },
  {
    slug: "acme-split-ac-15t",
    productName: "Acme Split AC 1.5T",
    title: "Service Manual",
    overview:
      "The Acme Split AC 1.5T is a 1.5-ton inverter split air conditioner (R-32 refrigerant) with an indoor evaporator unit and outdoor condenser. This manual covers airflow, cooling performance, and electrical faults. Switch off at the isolator before servicing.",
    components: [
      "Indoor unit — evaporator coil, blower wheel, washable air filters, and PCB.",
      "Outdoor unit — compressor, condenser coil, and fan.",
      "Remote / display board with error-code LEDs.",
      "Temperature thermistors (room and coil).",
      "Drain pan and drain hose.",
      "Inverter PCB and capacitor bank.",
    ],
    commonIssues: [
      {
        symptom: "Unit runs but cooling is weak.",
        causes: [
          "Dirty / clogged air filters restricting airflow.",
          "Iced or dirty evaporator coil.",
          "Low refrigerant charge (R-32).",
        ],
        fix: "Remove and wash the air filters. If the coil is iced, run fan-only to defrost and check airflow. If suction line is not cold and superheat is high, have a technician check refrigerant charge.",
      },
      {
        symptom: "Indoor unit leaks water inside the room.",
        causes: [
          "Blocked drain hose.",
          "Drain pan misaligned or cracked.",
        ],
        fix: "Flush the drain hose with water to clear algae blockage. Re-level the indoor unit so it slopes slightly toward the drain.",
      },
      {
        symptom: "Outdoor unit does not start, error LED blinking.",
        causes: [
          "Faulty start/run capacitor.",
          "Coil thermistor fault reported on the PCB.",
        ],
        fix: "Read the blink code against the table inside the indoor cover. Test the capacitor for rated microfarads. Measure thermistor resistance against the temperature chart; replace if open or shorted.",
      },
    ],
    maintenance: [
      { task: "Clean air filter", interval: "Every 3 months", notes: "Wash and dry before refitting." },
      { task: "Condenser coil cleaning", interval: "Every 6 months", notes: "Clear leaves and dust from outdoor coil." },
      { task: "Drain line flush", interval: "Every 6 months", notes: "Prevents indoor water leakage." },
      { task: "Refrigerant + electrical inspection", interval: "Every 12 months", notes: "Technician check of charge and capacitor." },
    ],
  },
];

/** Render one manual to a multi-page PDF at `outPath`. */
export function renderManualPdf(manual: Manual, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 56, size: "A4" });
    const stream = createWriteStream(outPath);
    stream.on("finish", () => resolve());
    stream.on("error", reject);
    doc.pipe(stream);

    // Title page header
    doc.fontSize(24).font("Helvetica-Bold").text(manual.productName);
    doc.moveDown(0.3);
    doc.fontSize(16).font("Helvetica").fillColor("#555").text(manual.title);
    doc.fillColor("#000");
    doc.moveDown(1);

    // 1. Overview
    doc.fontSize(15).font("Helvetica-Bold").text("1. Product Overview");
    doc.moveDown(0.4);
    doc.fontSize(11).font("Helvetica").text(manual.overview, { align: "justify" });
    doc.moveDown(1);

    // 2. Components
    doc.fontSize(15).font("Helvetica-Bold").text("2. Components");
    doc.moveDown(0.4);
    doc.fontSize(11).font("Helvetica");
    manual.components.forEach((c) => {
      doc.text(`• ${c}`, { indent: 10 });
      doc.moveDown(0.2);
    });
    doc.moveDown(0.8);

    // 3. Common issues, causes, fixes
    doc.addPage();
    doc.fontSize(15).font("Helvetica-Bold").text("3. Common Issues, Causes & Fixes");
    doc.moveDown(0.5);
    manual.commonIssues.forEach((issue, i) => {
      doc.fontSize(12).font("Helvetica-Bold").text(`3.${i + 1}  ${issue.symptom}`);
      doc.moveDown(0.2);
      doc.fontSize(11).font("Helvetica-Oblique").text("Possible causes:");
      doc.font("Helvetica");
      issue.causes.forEach((cause) => doc.text(`   - ${cause}`));
      doc.moveDown(0.2);
      doc.font("Helvetica-Bold").text("Fix: ", { continued: true }).font("Helvetica").text(issue.fix);
      doc.moveDown(0.8);
    });

    // 4. Maintenance schedule table
    doc.addPage();
    doc.fontSize(15).font("Helvetica-Bold").text("4. Maintenance Schedule");
    doc.moveDown(0.6);

    const startX = doc.x;
    let y = doc.y;
    const colTask = 210;
    const colInterval = 110;
    const rowH = 26;

    const drawRow = (
      c1: string,
      c2: string,
      c3: string,
      bold = false,
    ) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(10);
      doc.text(c1, startX + 4, y + 7, { width: colTask - 8 });
      doc.text(c2, startX + colTask + 4, y + 7, { width: colInterval - 8 });
      doc.text(c3, startX + colTask + colInterval + 4, y + 7, { width: 150 });
      doc.rect(startX, y, colTask + colInterval + 150, rowH).stroke("#999");
      y += rowH;
    };

    drawRow("Task", "Interval", "Notes", true);
    manual.maintenance.forEach((m) => drawRow(m.task, m.interval, m.notes));

    doc.end();
  });
}

/** Flatten a manual to plain text (for the Resource.extractedText column). */
export function manualToText(manual: Manual): string {
  const lines: string[] = [];
  lines.push(`${manual.productName} — ${manual.title}`);
  lines.push("");
  lines.push("1. PRODUCT OVERVIEW");
  lines.push(manual.overview);
  lines.push("");
  lines.push("2. COMPONENTS");
  manual.components.forEach((c) => lines.push(`- ${c}`));
  lines.push("");
  lines.push("3. COMMON ISSUES, CAUSES & FIXES");
  manual.commonIssues.forEach((issue, i) => {
    lines.push(`3.${i + 1} ${issue.symptom}`);
    lines.push("Possible causes:");
    issue.causes.forEach((cause) => lines.push(`  - ${cause}`));
    lines.push(`Fix: ${issue.fix}`);
    lines.push("");
  });
  lines.push("4. MAINTENANCE SCHEDULE");
  manual.maintenance.forEach((m) =>
    lines.push(`- ${m.task} | ${m.interval} | ${m.notes}`),
  );
  return lines.join("\n");
}
