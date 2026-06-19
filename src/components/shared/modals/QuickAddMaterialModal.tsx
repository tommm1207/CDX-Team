import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, PackagePlus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { generateNextMaterialCode, generateNextGroupCode } from '@/utils/inventory';
import { isUUID } from '@/utils/helpers';
import { toLocalISODate } from '@/utils/format';
import { CreatableSelect } from '../forms/CreatableSelect';

interface QuickAddMaterialModalProps {
  show: boolean;
  onClose: () => void;
  onSuccess: (newMaterial: any) => void;
  addToast?: (message: string, type?: any) => void;
  groups: any[];
  warehouses?: any[];
  color?: 'blue' | 'orange' | 'green';
  initialName?: string;
}

export const QuickAddMaterialModal = ({
  show,
  onClose,
  onSuccess,
  addToast,
  groups,
  warehouses = [],
  color = 'blue',
  initialName = '',
}: QuickAddMaterialModalProps) => {
  const [name, setName] = useState(initialName);
  const [unit, setUnit] = useState('');
  const [groupId, setGroupId] = useState('');
  const [spec, setSpec] = useState('');
  const [desc, setDesc] = useState('');
  const [code, setCode] = useState('');
  const [initialStock, setInitialStock] = useState<number>(0);
  const [initialUnitPrice, setInitialUnitPrice] = useState<number>(0);
  const [initialWarehouseId, setInitialWarehouseId] = useState('');
  const [loading, setLoading] = useState(false);
  const [extraGroups, setExtraGroups] = useState<{ id: string; name: string; code: string }[]>([]);

  const allGroups = [...groups, ...extraGroups];

  React.useEffect(() => {
    if (show) {
      setName(initialName);
    }
  }, [show, initialName]);

  const handleGroupChange = async (val: string) => {
    setGroupId(val);
    if (val && isUUID(val)) {
      const nextCode = await generateNextMaterialCode(val);
      setCode(nextCode);
    } else {
      setCode('');
    }
  };

  const handleCreateGroup = async (newName: string) => {
    const existing = allGroups.find((g) => g.name.toLowerCase() === newName.toLowerCase());
    if (existing) {
      handleGroupChange(existing.id);
      return;
    }
    try {
      const generatedGroupCode = await generateNextGroupCode();
      const { data: newGroup, error } = await supabase
        .from('material_groups')
        .insert([{ name: newName, code: generatedGroupCode }])
        .select()
        .single();
      if (error) throw error;
      setExtraGroups((prev: { id: string; name: string; code: string }[]) => [...prev, newGroup]);
      handleGroupChange(newGroup.id);
    } catch (err: any) {
      addToast?.('Lỗi tạo nhóm: ' + err.message, 'error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      addToast?.('Vui lòng nhập tên vật tư', 'error');
      return;
    }
    if (!groupId) {
      addToast?.('Vui lòng chọn nhóm vật tư', 'error');
      return;
    }
    if (initialStock > 0 && !initialWarehouseId) {
      addToast?.('Vui lòng chọn kho để nhập tồn đầu kỳ', 'error');
      return;
    }
    if (initialStock > 0 && !initialUnitPrice) {
      addToast?.('Vui lòng nhập đơn giá cho tồn đầu kỳ', 'error');
      return;
    }

    setLoading(true);
    try {
      // groupId is always a UUID at this point (set by handleGroupChange or handleCreateGroup)
      const finalGroupId = groupId;

      const finalCode = code || (await generateNextMaterialCode(finalGroupId));
      const payload = {
        name,
        code: finalCode,
        unit: unit || 'Cái',
        group_id: finalGroupId,
        specification: spec,
        description: desc,
        status: 'Đang sử dụng',
      };
      const { data, error } = await supabase.from('materials').insert([payload]).select();
      if (error) throw error;

      if (data && data[0]) {
        onSuccess(data[0]);
        addToast?.('Đã thêm vật tư mới!', 'success');
        onClose();
        // Reset state
        setName('');
        setUnit('');
        setGroupId('');
        setSpec('');
        setDesc('');
        setCode('');
        setInitialStock(0);
        setInitialUnitPrice(0);
        setInitialWarehouseId('');

        // Handle Initial Stock if provided
        if (initialStock > 0 && initialWarehouseId) {
          const today = toLocalISODate();
          const { error: stockErr } = await supabase.from('stock_in').insert([
            {
              material_id: data[0].id,
              warehouse_id: initialWarehouseId,
              quantity: initialStock,
              unit: unit || 'Cái',
              unit_price: initialUnitPrice,
              total_amount: initialStock * initialUnitPrice,
              date: today,
              import_code: 'START-' + finalCode,
              status: 'Đã duyệt',
              notes: 'Nhập tồn đầu kỳ (Khai báo khi thêm mới vật tư)',
            },
          ]);
          if (stockErr) {
            addToast?.(
              '⚠️ Vật tư đã tạo thành công, nhưng không thể nhập tồn đầu kỳ: ' + stockErr.message,
              'error',
            );
          } else {
            addToast?.(`Đã nhập ${initialStock} ${unit || 'Cái'} vào tồn đầu kỳ`, 'success');
          }
        }
      }
    } catch (err: any) {
      addToast?.('Lỗi: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {show && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`p-6 text-white flex items-center justify-between ${color === 'orange' ? 'bg-orange-500' : color === 'green' ? 'bg-green-600' : 'bg-blue-600'}`}
            >
              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="p-2 bg-white/20 hover:bg-white/30 rounded-xl transition-colors cursor-pointer"
                >
                  <PackagePlus size={24} />
                </button>
                <h3 className="font-bold text-lg">Thêm vật tư nhanh</h3>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <form
                id="quick-add-material-form"
                onSubmit={handleSubmit}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                <div className="md:col-span-2 space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">
                    Nhóm vật tư *
                  </label>
                  <CreatableSelect
                    value={groupId}
                    options={allGroups}
                    onChange={(val) => handleGroupChange(val)}
                    onCreate={(val) => handleCreateGroup(val)}
                    placeholder="Chọn hoặc nhập tên nhóm mới..."
                    required
                  />
                </div>
                <div className="md:col-span-2 space-y-2 mb-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                    Mã tham chiếu (Vật tư)
                  </label>
                  <div className="bg-primary/5 px-5 py-3.5 rounded-2xl border border-primary/10 text-sm font-black text-primary uppercase shadow-inner italic">
                    {code || (groupId ? 'Đang tính...' : '← Chọn nhóm vật tư trước')}
                  </div>
                </div>
                <div className="md:col-span-2 space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">
                    Tên vật tư *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="VD: Xi măng Hà Tiên..."
                    className={`w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 ${color === 'orange' ? 'focus:ring-orange-600/20' : color === 'green' ? 'focus:ring-green-600/20' : 'focus:ring-blue-600/20'}`}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">
                    Đơn vị tính
                  </label>
                  <input
                    type="text"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="VD: Cái, Kg, Bao..."
                    className={`w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 ${color === 'orange' ? 'focus:ring-orange-600/20' : color === 'green' ? 'focus:ring-green-600/20' : 'focus:ring-blue-600/20'}`}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Quy cách</label>
                  <input
                    type="text"
                    value={spec}
                    onChange={(e) => setSpec(e.target.value)}
                    placeholder="VD: 50kg, Φ12..."
                    className={`w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 ${color === 'orange' ? 'focus:ring-orange-600/20' : color === 'green' ? 'focus:ring-green-600/20' : 'focus:ring-blue-600/20'}`}
                  />
                </div>
                <div className="md:col-span-2 space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">
                    Mô tả chi tiết
                  </label>
                  <textarea
                    rows={2}
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    placeholder="Mô tả thêm về vật tư nếu cần..."
                    className={`w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 resize-none ${color === 'orange' ? 'focus:ring-orange-600/20' : color === 'green' ? 'focus:ring-green-600/20' : 'focus:ring-blue-600/20'}`}
                  />
                </div>

                <div className="md:col-span-2 pt-4 border-t border-gray-100 mt-2">
                  <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                    Thiết lập tồn kho đầu kỳ (Tùy chọn)
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Số lượng tồn đầu
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={initialStock || ''}
                        onChange={(e) => setInitialStock(Number(e.target.value))}
                        placeholder="0.00"
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-green-600/10"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Đơn giá {initialStock > 0 && <span className="text-red-400">*</span>}
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={initialUnitPrice || ''}
                        onChange={(e) => setInitialUnitPrice(Number(e.target.value))}
                        placeholder="Nhập đơn giá..."
                        className={`w-full px-4 py-2 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-green-600/10 ${initialStock > 0 && !initialUnitPrice ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">
                        Kho lưu trữ {initialStock > 0 && <span className="text-red-400">*</span>}
                      </label>
                      <select
                        value={initialWarehouseId}
                        onChange={(e) => setInitialWarehouseId(e.target.value)}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-green-600/10 bg-white"
                      >
                        <option value="">-- Chọn kho --</option>
                        {warehouses.map((w: any) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-400 italic mt-2 ml-1">
                    * Nếu nhập tồn đầu, hệ thống sẽ tự động tạo một phiếu nhập "Đã duyệt" cho vật tư
                    này.
                  </p>
                </div>
              </form>
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 rounded-b-3xl">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-200 transition-colors"
              >
                Hủy
              </button>
              <button
                form="quick-add-material-form"
                type="submit"
                disabled={loading}
                className={`px-8 py-2 text-white rounded-xl text-sm font-bold transition-all shadow-lg disabled:opacity-50 ${color === 'orange' ? 'bg-orange-600 hover:bg-orange-700 shadow-orange-600/20' : color === 'green' ? 'bg-green-600 hover:bg-green-700 shadow-green-600/20' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'}`}
              >
                {loading ? 'Đang lưu...' : 'Lưu vật tư'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
