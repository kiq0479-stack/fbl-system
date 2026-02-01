// @ts-nocheck
'use client';

import { createClient } from '@/lib/supabase/client';
import { Database } from '@/types/database';
import { useEffect, useState } from 'react';

type Supply = Database['public']['Tables']['supplies']['Row'];

interface SupplyFormProps {
  onClose: () => void;
  onSuccess: () => void;
  initialData?: Supply | null;
}

export default function SupplyForm({ onClose, onSuccess, initialData }: SupplyFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<Partial<Supply>>({
    name: '',
    sku: `SUP-${Date.now().toString(36).toUpperCase()}`,
    qr_code: '',
    unit_name: 'EA',
    unit_qty: 1,
    is_active: true,
  });

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    }
  }, [initialData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    let val: string | number | boolean = value;

    if (type === 'number') {
      val = value === '' ? 0 : parseFloat(value);
    } else if (type === 'checkbox') {
      val = (e.target as HTMLInputElement).checked;
    }

    setFormData((prev) => ({ ...prev, [name]: val }));
  };



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();
    try {
      if (initialData?.id) {
        // Update
        const { id, created_at, updated_at, ...updateData } = formData;
        // @ts-ignore
        const { error } = await supabase
          .from('supplies')
          .update(updateData)
          .eq('id', initialData.id);
        if (error) throw error;
      } else {
        // Insert
        // @ts-ignore
        const { error } = await supabase.from('supplies').insert(formData);
        if (error) throw error;
      }
      onSuccess();
    } catch (error) {
      console.error('Error saving supply:', error);
      alert('부자재 저장 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-xl font-bold text-slate-800">
            {initialData ? '부자재 수정' : '부자재 등록'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">부자재명 <span className="text-red-500">*</span></label>
              <input
                type="text"
                name="name"
                required
                value={formData.name}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800"
                placeholder="박스 테이프"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">바코드 (Code128)</label>
              <input
                type="text"
                name="qr_code"
                value={formData.qr_code || ''}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800 font-mono"
                placeholder="SUP-001 또는 원하는 바코드 값 입력"
              />
              <p className="text-xs text-slate-400">부자재 식별용 바코드 값을 입력하세요</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500 uppercase">단위명</label>
                <input
                  type="text"
                  name="unit_name"
                  value={formData.unit_name || ''}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800"
                  placeholder="Roll"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500 uppercase">단위 수량</label>
                <input
                  type="number"
                  name="unit_qty"
                  value={formData.unit_qty || 0}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800 text-right"
                />
              </div>
            </div>

             <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">상태</label>
              <select
                name="is_active"
                value={formData.is_active ? 'true' : 'false'}
                onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.value === 'true' }))}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800"
              >
                <option value="true">활성</option>
                <option value="false">비활성</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-6 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-lg shadow-blue-500/30 transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading && (
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
              {initialData ? '저장하기' : '등록하기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
