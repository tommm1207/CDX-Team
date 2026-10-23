import { useState } from 'react';
import {
  FileText,
  Download,
  ArrowLeft,
  Building2,
  User,
  Calendar,
  DollarSign,
  ArrowLeftRight,
  Plus,
  Trash2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/shared';
import { NumericInput } from '@/components/shared';
import { exportSteelSheetContract } from '@/utils/contractExport';
import { toLocalISODate } from '@/utils/format';

const PARTY_A_DEFAULT = {
  companyName: 'CÔNG TY CỔ PHẦN XUẤT NHẬP KHẨU CON ĐƯỜNG XANH',
  representative: 'Nguyễn Đức Thắng',
  position: 'Giám đốc',
  address: 'Lầu 7, số 207 đường Hoàng Sa, Phường Tân Định, Tp Hồ Chí Minh.',
  taxCode: '0310385381',
  email: 'congtycdx@gmail.com',
  phone: '0931884886 (A Khang đại diện làm việc)',
};

const INPUT_STYLE =
  'w-full px-4 py-2.5 bg-gray-50 border border-transparent rounded-xl text-sm font-bold outline-none focus:bg-white focus:border-primary/20 transition-all placeholder:text-gray-300';
const LABEL_STYLE = 'text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 block ml-1';

export const LeaseSteelSheetForm = ({
  onBack,
  addToast,
  contractId,
  initialData,
}: {
  onBack: () => void;
  addToast: any;
  /** Khi sửa hợp đồng có sẵn: id bản ghi và dữ liệu form đã chuyển đổi từ DB */
  contractId?: string;
  initialData?: any;
}) => {
  const [loading, setLoading] = useState(false);
  // null = chưa lưu lần nào → insert; có id → update đúng bản ghi đó
  const [savedId, setSavedId] = useState<string | null>(contractId || null);
  const [formData, setFormData] = useState(
    initialData ?? {
      contractCode: `HĐCT/CDX-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      date: toLocalISODate(),
      partyA: { ...PARTY_A_DEFAULT },
      partyB: {
        companyName: '',
        representative: '',
        position: 'Giám đốc',
        address: '',
        taxCode: '',
        phone: '',
      },
      content: {
        projectName: 'TRAM BIEN AP 500KV LONG THANH',
        category: 'CHO THUE THEP TON TAM',
        location: 'Long Thanh - Dong Nai',
      },
      items: [
        { id: 1, name: 'Cho thuê thép tôn tấm', unit: 'tấm/tháng', quantity: 40, price: 1200000 },
        {
          id: 2,
          name: 'Vận chuyển vật tư lượt đi về',
          unit: 'kg/lượt',
          quantity: 2,
          price: 9000000,
        },
      ],
    },
  );

  const handleSwap = () => {
    const newA = { ...formData.partyB };
    const newB = { ...formData.partyA };
    setFormData({ ...formData, partyA: newA, partyB: newB });
    addToast('Đã hoán đổi vị trí Bên A và Bên B', 'info');
  };

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { id: Date.now(), name: '', unit: '', quantity: 0, price: 0 }],
    });
  };

  const removeItem = (id: number) => {
    setFormData({ ...formData, items: formData.items.filter((item) => item.id !== id) });
  };

  const updateItem = (id: number, field: string, value: any) => {
    setFormData({
      ...formData,
      items: formData.items.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    });
  };

  const isCDX_A = formData.partyA.companyName.includes('CON ĐƯỜNG XANH');

  const subTotal = formData.items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const vat = subTotal * 0.08;
  const total = subTotal + vat;

  const handleSave = async () => {
    setLoading(true);
    try {
      const payload = {
        contract_code: formData.contractCode,
        type: 'THUE_THEP_TAM',
        party_a_info: formData.partyA,
        party_b_info: formData.partyB,
        content: { ...formData.content, items: formData.items, total, date: formData.date },
        status: 'Đã ký',
      };
      // Không dùng upsert theo contract_code: mã trùng sẽ ghi đè mất hợp đồng khác
      if (savedId) {
        const { error } = await supabase.from('contracts').update(payload).eq('id', savedId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('contracts')
          .insert([payload])
          .select('id')
          .single();
        if (error) throw error;
        setSavedId(data.id);
      }
      return true;
    } catch (error: any) {
      addToast('Lỗi lưu dữ liệu: ' + error.message, 'error');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    const isSaved = await handleSave();
    if (!isSaved) return;
    setLoading(true);
    try {
      await exportSteelSheetContract(formData);
      addToast('Đã lưu và tạo file Word thành công!', 'success');
    } catch (error: any) {
      addToast('Lỗi xuất file: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-md border-b border-gray-100 px-4 py-4 sticky top-0 z-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-xl transition-all">
            <ArrowLeft size={20} className="text-gray-500" />
          </button>
          <div>
            <h1 className="text-sm font-black text-gray-800 uppercase tracking-tight flex items-center gap-2">
              <FileText size={16} className="text-primary" />
              Thuê thép tấm
            </h1>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
              {formData.contractCode}
            </p>
          </div>
        </div>
        <Button variant="blue" size="sm" onClick={handleExport} isLoading={loading}>
          <Download size={16} className="mr-2" /> Xuất file Word
        </Button>
      </div>

      <div className="p-4 space-y-6 max-w-5xl mx-auto">
        {/* Thông tin dự án */}
        <section className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4">
          <div className="flex items-center gap-2 text-primary">
            <Building2 size={18} />
            <h2 className="text-sm font-black uppercase tracking-tight">Thông tin dự án</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={LABEL_STYLE}>Tên công trình</label>
              <input
                type="text"
                value={formData.content.projectName}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    content: { ...formData.content, projectName: e.target.value },
                  })
                }
                className={INPUT_STYLE}
              />
            </div>
            <div>
              <label className={LABEL_STYLE}>Hạng mục</label>
              <input
                type="text"
                value={formData.content.category}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    content: { ...formData.content, category: e.target.value },
                  })
                }
                className={INPUT_STYLE}
              />
            </div>
            <div>
              <label className={LABEL_STYLE}>Địa điểm</label>
              <input
                type="text"
                value={formData.content.location}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    content: { ...formData.content, location: e.target.value },
                  })
                }
                className={INPUT_STYLE}
              />
            </div>
          </div>
        </section>

        {/* Khu vực A & B */}
        <div className="relative grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Nút Swap */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
            <button
              onClick={handleSwap}
              className="w-10 h-10 bg-white border border-gray-100 shadow-xl rounded-full flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all active:scale-90"
            >
              <ArrowLeftRight size={18} />
            </button>
          </div>

          {/* BÊN A */}
          <section
            className={`bg-white rounded-3xl p-6 shadow-sm border ${isCDX_A ? 'border-blue-100' : 'border-orange-100'} space-y-4`}
          >
            <div
              className={`flex items-center gap-2 ${isCDX_A ? 'text-blue-600' : 'text-orange-600'}`}
            >
              <Building2 size={18} />
              <h2 className="text-xs font-black uppercase tracking-widest">
                BÊN A ({isCDX_A ? 'BÊN CHO THUÊ' : 'BÊN THUÊ'})
              </h2>
            </div>
            <div className="space-y-3">
              <div>
                <label className={LABEL_STYLE}>Tên đơn vị</label>
                <input
                  type="text"
                  value={formData.partyA.companyName}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      partyA: { ...formData.partyA, companyName: e.target.value },
                    })
                  }
                  className={INPUT_STYLE}
                />
              </div>
              <div>
                <label className={LABEL_STYLE}>Đại diện</label>
                <input
                  type="text"
                  value={formData.partyA.representative}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      partyA: { ...formData.partyA, representative: e.target.value },
                    })
                  }
                  className={INPUT_STYLE}
                />
              </div>
            </div>
          </section>

          {/* BÊN B */}
          <section
            className={`bg-white rounded-3xl p-6 shadow-sm border ${!isCDX_A ? 'border-blue-100' : 'border-orange-100'} space-y-4`}
          >
            <div
              className={`flex items-center gap-2 ${!isCDX_A ? 'text-blue-600' : 'text-orange-600'}`}
            >
              <User size={18} />
              <h2 className="text-xs font-black uppercase tracking-widest">
                BÊN B ({!isCDX_A ? 'BÊN CHO THUÊ' : 'BÊN THUÊ'})
              </h2>
            </div>
            <div className="space-y-3">
              <div>
                <label className={LABEL_STYLE}>Tên đơn vị</label>
                <input
                  type="text"
                  value={formData.partyB.companyName}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      partyB: { ...formData.partyB, companyName: e.target.value },
                    })
                  }
                  className={INPUT_STYLE}
                />
              </div>
              <div>
                <label className={LABEL_STYLE}>Đại diện</label>
                <input
                  type="text"
                  value={formData.partyB.representative}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      partyB: { ...formData.partyB, representative: e.target.value },
                    })
                  }
                  className={INPUT_STYLE}
                />
              </div>
            </div>
          </section>
        </div>

        {/* Bảng chi tiết vật tư */}
        <section className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4 overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-primary">
              <DollarSign size={18} />
              <h2 className="text-sm font-black uppercase tracking-tight">Chi tiết đơn giá</h2>
            </div>
            <button
              onClick={addItem}
              className="text-xs font-black text-primary flex items-center gap-1 hover:bg-primary/5 px-3 py-1.5 rounded-xl transition-all"
            >
              <Plus size={14} /> THÊM DÒNG
            </button>
          </div>

          <div className="overflow-x-auto -mx-6 px-6">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                  <th className="pb-4 text-left w-10">STT</th>
                  <th className="pb-4 text-left pr-4">HẠNG MỤC / CÔNG VIỆC</th>
                  <th className="pb-4 text-left w-24 pr-4">ĐVT</th>
                  <th className="pb-4 text-right w-20 pr-4">SL</th>
                  <th className="pb-4 text-right w-36 pr-4">ĐƠN GIÁ</th>
                  <th className="pb-4 text-right w-32">THÀNH TIỀN</th>
                  <th className="pb-4 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {formData.items.map((item, index) => (
                  <tr key={item.id} className="group hover:bg-gray-50/50 transition-colors">
                    <td className="py-4 text-gray-400 font-black">{index + 1}</td>
                    <td className="py-4 pr-4">
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => updateItem(item.id, 'name', e.target.value)}
                        className="w-full bg-transparent outline-none font-bold text-gray-700 border-none p-0 focus:ring-0"
                      />
                    </td>
                    <td className="py-4 pr-4">
                      <input
                        type="text"
                        value={item.unit}
                        onChange={(e) => updateItem(item.id, 'unit', e.target.value)}
                        className="w-full bg-transparent outline-none text-gray-500 border-none p-0 focus:ring-0"
                      />
                    </td>
                    <td className="py-4 pr-4">
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.id, 'quantity', Number(e.target.value))}
                        className="w-full bg-transparent outline-none text-right font-black border-none p-0 focus:ring-0"
                      />
                    </td>
                    <td className="py-4 pr-4">
                      <NumericInput
                        value={item.price}
                        onChange={(val) => updateItem(item.id, 'price', val)}
                        className="text-right font-black text-primary border-none p-0"
                      />
                    </td>
                    <td className="py-4 text-right font-black text-gray-800">
                      {(item.quantity * item.price).toLocaleString()}
                    </td>
                    <td className="py-4 text-right">
                      <button
                        onClick={() => removeItem(item.id)}
                        className="p-2 text-red-200 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pt-6 border-t border-gray-50 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">
                Tạm tính:
              </span>
              <span className="font-black text-gray-600">{subTotal.toLocaleString()} VNĐ</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">
                Thuế VAT (8%):
              </span>
              <span className="font-black text-gray-600">{vat.toLocaleString()} VNĐ</span>
            </div>
            <div className="flex justify-between items-center bg-primary/5 p-4 rounded-2xl border border-primary/10">
              <span className="text-primary font-black uppercase italic tracking-tight">
                Tổng thanh toán:
              </span>
              <span className="font-black text-2xl text-primary underline underline-offset-4 tracking-tighter">
                {total.toLocaleString()} VNĐ
              </span>
            </div>
          </div>
        </section>

        <Button
          variant="blue"
          className="w-full py-5 rounded-3xl shadow-xl shadow-primary/20 uppercase font-black tracking-widest text-base"
          onClick={handleExport}
          isLoading={loading}
        >
          <FileText size={20} className="mr-3" /> XUẤT HỢP ĐỒNG THÉP TẤM (.DOCX)
        </Button>
      </div>
    </div>
  );
};
