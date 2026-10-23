import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from 'docx';
import { saveAs } from 'file-saver';
import { numberToVnText } from './numberToVnText';

const DEFAULT_FONT = 'Times New Roman';
const DEFAULT_SIZE = 26; // 13pt = 26 half-points

/**
 * Tạo file Word cho Hợp đồng thuê thép tấm
 */
export const exportSteelSheetContract = async (data: any) => {
  const { partyA, partyB, content, contractCode, date, items } = data;
  const signDate = new Date(date || new Date());
  const isCDX_A = partyA.companyName.includes('CON ĐƯỜNG XANH');

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',
                bold: true,
                size: DEFAULT_SIZE,
                font: DEFAULT_FONT,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'Độc lập - Tự do - Hạnh phúc',
                bold: true,
                size: DEFAULT_SIZE,
                font: DEFAULT_FONT,
              }),
            ],
          }),
          new Paragraph({ spacing: { before: 400 } }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: 'HỢP ĐỒNG CHO THUÊ', bold: true, size: 32, font: DEFAULT_FONT }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: `Số: ${contractCode}`,
                italics: true,
                size: DEFAULT_SIZE,
                font: DEFAULT_FONT,
              }),
            ],
          }),
          new Paragraph({ spacing: { before: 300 } }),

          // Bên A
          new Paragraph({
            children: [
              new TextRun({
                text: `BÊN A (${isCDX_A ? 'BÊN CHO THUÊ' : 'BÊN THUÊ'}): `,
                bold: true,
                size: DEFAULT_SIZE,
                font: DEFAULT_FONT,
              }),
              new TextRun({
                text: partyA.companyName,
                bold: true,
                size: DEFAULT_SIZE,
                font: DEFAULT_FONT,
              }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `\tĐịa chỉ: ${partyA.address || ''}`,
                size: DEFAULT_SIZE,
                font: DEFAULT_FONT,
              }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `\tĐại diện: ${partyA.representative || ''}\t\tChức vụ: ${partyA.position || ''}`,
                size: DEFAULT_SIZE,
                font: DEFAULT_FONT,
              }),
            ],
          }),

          new Paragraph({ spacing: { before: 200 } }),

          // Bên B
          new Paragraph({
            children: [
              new TextRun({
                text: `BÊN B (${!isCDX_A ? 'BÊN CHO THUÊ' : 'BÊN THUÊ'}): `,
                bold: true,
                size: DEFAULT_SIZE,
                font: DEFAULT_FONT,
              }),
              new TextRun({
                text: partyB.companyName,
                bold: true,
                size: DEFAULT_SIZE,
                font: DEFAULT_FONT,
              }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `\tĐịa chỉ: ${partyB.address || ''}`,
                size: DEFAULT_SIZE,
                font: DEFAULT_FONT,
              }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `\tĐại diện: ${partyB.representative || ''}\t\tChức vụ: ${partyB.position || ''}`,
                size: DEFAULT_SIZE,
                font: DEFAULT_FONT,
              }),
            ],
          }),

          new Paragraph({ spacing: { before: 300 } }),
          new Paragraph({
            children: [
              new TextRun({
                text: 'ĐIỀU 1: CHI TIẾT VẬT TƯ VÀ ĐƠN GIÁ',
                bold: true,
                size: DEFAULT_SIZE,
                font: DEFAULT_FONT,
              }),
            ],
          }),

          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                          new TextRun({ text: 'STT', bold: true, size: 22, font: DEFAULT_FONT }),
                        ],
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                          new TextRun({
                            text: 'Hạng mục',
                            bold: true,
                            size: 22,
                            font: DEFAULT_FONT,
                          }),
                        ],
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                          new TextRun({ text: 'ĐVT', bold: true, size: 22, font: DEFAULT_FONT }),
                        ],
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                          new TextRun({ text: 'SL', bold: true, size: 22, font: DEFAULT_FONT }),
                        ],
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                          new TextRun({
                            text: 'Đơn giá',
                            bold: true,
                            size: 22,
                            font: DEFAULT_FONT,
                          }),
                        ],
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                          new TextRun({
                            text: 'Thành tiền',
                            bold: true,
                            size: 22,
                            font: DEFAULT_FONT,
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
              ...(items || []).map(
                (item: any, index: number) =>
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [
                          new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [
                              new TextRun({
                                text: (index + 1).toString(),
                                size: 22,
                                font: DEFAULT_FONT,
                              }),
                            ],
                          }),
                        ],
                      }),
                      new TableCell({
                        children: [
                          new Paragraph({
                            children: [
                              new TextRun({ text: item.name, size: 22, font: DEFAULT_FONT }),
                            ],
                          }),
                        ],
                      }),
                      new TableCell({
                        children: [
                          new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [
                              new TextRun({ text: item.unit, size: 22, font: DEFAULT_FONT }),
                            ],
                          }),
                        ],
                      }),
                      new TableCell({
                        children: [
                          new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [
                              new TextRun({
                                text: item.quantity.toString(),
                                size: 22,
                                font: DEFAULT_FONT,
                              }),
                            ],
                          }),
                        ],
                      }),
                      new TableCell({
                        children: [
                          new Paragraph({
                            alignment: AlignmentType.RIGHT,
                            children: [
                              new TextRun({
                                text: item.price.toLocaleString(),
                                size: 22,
                                font: DEFAULT_FONT,
                              }),
                            ],
                          }),
                        ],
                      }),
                      new TableCell({
                        children: [
                          new Paragraph({
                            alignment: AlignmentType.RIGHT,
                            children: [
                              new TextRun({
                                text: (item.quantity * item.price).toLocaleString(),
                                size: 22,
                                font: DEFAULT_FONT,
                              }),
                            ],
                          }),
                        ],
                      }),
                    ],
                  }),
              ),
            ],
          }),

          new Paragraph({ spacing: { before: 800 } }),
          new Paragraph({
            children: [
              new TextRun({
                text: 'ĐẠI DIỆN BÊN A\t\t\t\t\tĐẠI DIỆN BÊN B',
                bold: true,
                size: DEFAULT_SIZE,
                font: DEFAULT_FONT,
              }),
            ],
          }),
        ],
      },
    ],
  });

  // toBlob chạy được trên trình duyệt; toBuffer cần Node Buffer
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `Hop_Dong_Thue_Thep_Tam_${contractCode || 'New'}.docx`);
};

/**
 * Tạo file Word cho Hợp đồng thuê xe cuốc
 */
export const exportLeaseVehicleContract = async (data: any) => {
  const { partyA, partyB, content, contractCode, date } = data;
  const signDate = new Date(date || new Date());
  const isCDX_A = partyA.companyName.includes('CON ĐƯỜNG XANH');

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',
                bold: true,
                size: DEFAULT_SIZE,
                font: DEFAULT_FONT,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'Độc lập - Tự do - Hạnh phúc',
                bold: true,
                size: DEFAULT_SIZE,
                font: DEFAULT_FONT,
              }),
            ],
          }),
          new Paragraph({ spacing: { before: 400 } }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: 'HỢP ĐỒNG KINH TẾ', bold: true, size: 32, font: DEFAULT_FONT }),
            ],
          }),
          new Paragraph({ spacing: { before: 300 } }),

          new Paragraph({
            children: [
              new TextRun({
                text: `BÊN A (${isCDX_A ? 'BÊN THUÊ' : 'BÊN CHO THUÊ'}): `,
                bold: true,
                size: DEFAULT_SIZE,
                font: DEFAULT_FONT,
              }),
              new TextRun({
                text: partyA.companyName,
                bold: true,
                size: DEFAULT_SIZE,
                font: DEFAULT_FONT,
              }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `\tĐại diện: ${partyA.representative || ''}\t\tChức vụ: ${partyA.position || ''}`,
                size: DEFAULT_SIZE,
                font: DEFAULT_FONT,
              }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `\tĐịa chỉ: ${partyA.address || ''}`,
                size: DEFAULT_SIZE,
                font: DEFAULT_FONT,
              }),
            ],
          }),

          new Paragraph({ spacing: { before: 200 } }),

          new Paragraph({
            children: [
              new TextRun({
                text: `BÊN B (${!isCDX_A ? 'BÊN THUÊ' : 'BÊN CHO THUÊ'}): `,
                bold: true,
                size: DEFAULT_SIZE,
                font: DEFAULT_FONT,
              }),
              new TextRun({
                text: partyB.companyName,
                bold: true,
                size: DEFAULT_SIZE,
                font: DEFAULT_FONT,
              }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `\tĐại diện: ${partyB.representative || ''}\t\tChức vụ: ${partyB.position || ''}`,
                size: DEFAULT_SIZE,
                font: DEFAULT_FONT,
              }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `\tĐịa chỉ: ${partyB.address || ''}`,
                size: DEFAULT_SIZE,
                font: DEFAULT_FONT,
              }),
            ],
          }),

          new Paragraph({ spacing: { before: 300 } }),
          new Paragraph({
            children: [
              new TextRun({
                text: 'ĐIỀU 1: NỘI DUNG VÀ ĐƠN GIÁ THUÊ.',
                bold: true,
                size: DEFAULT_SIZE,
                font: DEFAULT_FONT,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            children: [
              new TextRun({ text: content.workContent, size: DEFAULT_SIZE, font: DEFAULT_FONT }),
            ],
          }),

          new Paragraph({ spacing: { before: 100 } }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Giá thuê: ${Number(content.totalPrice).toLocaleString()} VNĐ/tháng (Bằng chữ: ${numberToVnText(content.totalPrice)}/tháng).`,
                size: DEFAULT_SIZE,
                font: DEFAULT_FONT,
              }),
            ],
          }),

          new Paragraph({ spacing: { before: 800 } }),
          new Paragraph({
            children: [
              new TextRun({
                text: 'ĐẠI DIỆN BÊN A\t\t\t\t\tĐẠI DIỆN BÊN B',
                bold: true,
                size: DEFAULT_SIZE,
                font: DEFAULT_FONT,
              }),
            ],
          }),
        ],
      },
    ],
  });

  // toBlob chạy được trên trình duyệt; toBuffer cần Node Buffer
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `Hop_Dong_Thue_Xe_${contractCode || 'New'}.docx`);
};
