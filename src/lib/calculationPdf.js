import { registerFonts } from './quotePdf';
import { SITE_NAME, SITE_PHONE_DISPLAY, SITE_EMAIL } from './siteConfig';

export async function downloadCalculationPdf(title, text) {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await registerFonts(doc);
  function header(continued = false) {
    doc.setFont('Roboto-Bold', 'normal');
    doc.setTextColor(30, 75, 115);
    doc.setFontSize(16);
    doc.text(SITE_NAME, 15, 20);
    doc.setFont('Roboto', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(`${SITE_PHONE_DISPLAY} · ${SITE_EMAIL}`, 15, 27);
    doc.setDrawColor(180, 202, 225);
    doc.line(15, 32, 195, 32);
    doc.setFont('Roboto-Bold', 'normal');
    doc.setTextColor(30, 50, 70);
    doc.setFontSize(13);
    doc.text(continued ? 'Продолжение расчёта' : title, 15, 42);
    doc.setFont('Roboto', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(25);
  }
  header();
  const lines = doc.splitTextToSize(
    `${text}\n\nСправочный расчёт. Параметры конкретного изделия и партии уточняйте перед заказом.`,
    180
  );
  let y = 52;
  for (const line of lines) {
    if (y > 272) {
      doc.addPage();
      header(true);
      y = 52;
    }
    doc.text(line, 15, y);
    y += 5;
  }
  const count = doc.getNumberOfPages();
  for (let page = 1; page <= count; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(210);
    doc.line(15, 282, 195, 282);
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text('Сервис ЮжУралЭлектроКабель · справочные данные', 15, 289);
    doc.text(`${page} / ${count}`, 195, 289, { align: 'right' });
  }
  doc.save('cable-calculation.pdf');
}
