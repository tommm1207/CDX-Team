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
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/shared';
import { NumericInput } from '@/components/shared';
import { exportLeaseVehicleContract } from '@/utils/contractExport';
import { toLocalISODate } from '@/utils/format';

const PARTY_A_DEFAULT = {
  companyName: 'CÔNG TY CỔ PHẦN XUẤT NHẬP KHẨU CON ĐƯỜNG XANH',
  representative: 'Nguyễn Đức Thắng',
  position: 'Giám đốc',
  address: 'Lầu 7, số 207 đường Hoàng Sa, Phường Tân Định, Tp Hồ Chí Minh.',
  taxCode: '0310385381',
  email: 'congtycdx@gmail.com',
  phone: '0931884886 (A Khang đại diện làm việc)',
  notes: 'Biên bản/giấy uỷ quyền cho thuê. người đại diện theo pháp luật',
};

const INPUT_STYLE =
  'w-full px-4 py-2.5 bg-gray-50 border border-transparent rounded-xl text-sm font-bold outline-none focus:bg-white focus:border-primary/20 transition-all placeholder:text-gray-300';
const LABEL_STYLE = 'text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 block ml-1';

export const LeaseVehicleForm = ({
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
      contractCode: `HĐKT/CDX-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      date: toLocalISODate(),
      partyA: { ...PARTY_A_DEFAULT },
      partyB: {
        companyName: '',
        representative: '',
        position: 'Giám đốc',
        address: '',
        taxCode: '',
        email: '',
        phone: '',
        bankAccount: '',
      },
      content: {
        workContent:
          'Bên B đồng ý cho bên A thuê các thiết bị: 01 xe đào bánh xích (từ 05 trở lên); 01 chẹc vận chuyển và gồm cả (hợp đồng tài xế, tài công) điều khiển làm việc để phục vụ thi công công trình điện vị trí VT26, VT27 tại Xã Tân Chánh (thuộc dự án Trạm biến áp 220kV và đường dây đấu nối Gò Công – Cần Đước)',
        duration: '01 tháng',
        startDate: toLocalISODate(),
        totalPrice: 64800000,
        paymentAmount: 34800000,
      },
    },
  );

  const handleSwap = () => {
    const newA = { ...formData.partyB };
    const newB = { ...formData.partyA };
    setFormData({ ...formData, partyA: newA, partyB: newB });
    addToast('Đã hoán đổi vị trí Bên A và Bên B', 'info');
  };

  const isCDX_A = formData.partyA.companyName.includes('CON ĐƯỜNG XANH');

  const handleSave = async () => {
    setLoading(true);
    try {
      const payload = {
        contract_code: formData.contractCode,
        type: 'THUE_XE',
        party_a_info: formData.partyA,
        party_b_info: formData.partyB,
        content: { ...formData.content, date: formData.date },
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
      await exportLeaseVehicleContract(formData);
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
              Thuê xe cuốc
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
        {/* Thông tin chung */}
        <section className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4">
          <div className="flex items-center gap-2 text-primary">
            <Calendar size={18} />
            <h2 className="text-sm font-black uppercase tracking-tight">Thông tin chung</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={LABEL_STYLE}>Mã hợp đồng</label>
              <input
                type="text"
                value={formData.contractCode}
                onChange={(e) => setFormData({ ...formData, contractCode: e.target.value })}
                className={INPUT_STYLE}
              />
            </div>
            <div>
              <label className={LABEL_STYLE}>Ngày ký</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
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
                BÊN A ({isCDX_A ? 'BÊN THUÊ' : 'BÊN CHO THUÊ'})
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
              <div className="grid grid-cols-2 gap-3">
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
                <div>
                  <label className={LABEL_STYLE}>Chức vụ</label>
                  <input
                    type="text"
                    value={formData.partyA.position}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        partyA: { ...formData.partyA, position: e.target.value },
                      })
                    }
                    className={INPUT_STYLE}
                  />
                </div>
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
                BÊN B ({!isCDX_A ? 'BÊN THUÊ' : 'BÊN CHO THUÊ'})
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
              <div className="grid grid-cols-2 gap-3">
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
                <div>
                  <label className={LABEL_STYLE}>Chức vụ</label>
                  <input
                    type="text"
                    value={formData.partyB.position}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        partyB: { ...formData.partyB, position: e.target.value },
                      })
                    }
                    className={INPUT_STYLE}
                  />
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Nội dung và giá */}
        <section className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4">
          <div className="flex items-center gap-2 text-primary">
            <DollarSign size={18} />
            <h2 className="text-sm font-black uppercase tracking-tight">Nội dung & Đơn giá</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className={LABEL_STYLE}>Nội dung công việc</label>
              <textarea
                rows={3}
                value={formData.content.workContent}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    content: { ...formData.content, workContent: e.target.value },
                  })
                }
                className={`${INPUT_STYLE} resize-none`}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={LABEL_STYLE}>Giá thuê (VNĐ/tháng)</label>
                <NumericInput
                  value={formData.content.totalPrice}
                  onChange={(val) =>
                    setFormData({ ...formData, content: { ...formData.content, totalPrice: val } })
                  }
                />
              </div>
              <div>
                <label className={LABEL_STYLE}>Số tiền thanh toán (VNĐ/tháng)</label>
                <NumericInput
                  value={formData.content.paymentAmount}
                  onChange={(val) =>
                    setFormData({
                      ...formData,
                      content: { ...formData.content, paymentAmount: val },
                    })
                  }
                />
              </div>
            </div>
          </div>
        </section>

        <Button
          variant="blue"
          className="w-full py-5 rounded-3xl shadow-xl shadow-primary/20 uppercase font-black tracking-widest text-base"
          onClick={handleExport}
          isLoading={loading}
        >
          <FileText size={20} className="mr-3" /> TẠO VÀ TẢI FILE WORD (.DOCX)
        </Button>
      </div>
    </div>
  );
};
