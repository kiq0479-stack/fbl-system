'use client';

import { createClient } from '@/lib/supabase/client';
import { Database } from '@/types/database';
import { useEffect, useState } from 'react';
import FactoryForm from '@/components/factories/FactoryForm';
import FactoryTable from '@/components/factories/FactoryTable';

type Factory = Database['public']['Tables']['factories']['Row'];

export default function FactoriesPage() {
  const [factories, setFactories] = useState<Factory[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFactory, setEditingFactory] = useState<Factory | null>(null);

  const fetchFactories = async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('factories')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) console.error('Error fetching factories:', error);
    else setFactories(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchFactories(); }, []);

  const handleCreate = () => { setEditingFactory(null); setIsModalOpen(true); };
  const handleEdit = (factory: Factory) => { setEditingFactory(factory); setIsModalOpen(true); };
  const handleDelete = async (id: string) => {
    if (!confirm('정말 이 공장을 삭제하시겠습니까?')) return;
    const supabase = createClient();
    const { error } = await supabase.from('factories').delete().eq('id', id);
    if (error) alert('삭제 중 오류가 발생했습니다. 이 공장을 사용하는 상품이 있을 수 있습니다.');
    else fetchFactories();
  };
  const handleSuccess = () => { setIsModalOpen(false); fetchFactories(); };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">공장 관리</h1>
          <p className="text-sm text-slate-500 mt-1">등록된 공장을 조회하고 관리합니다.</p>
        </div>
        <button
          onClick={handleCreate}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          공장 등록
        </button>
      </div>

      {loading ? (
        <div className="text-center text-slate-400 py-12">로딩중...</div>
      ) : (
        <FactoryTable factories={factories} onEdit={handleEdit} onDelete={handleDelete} />
      )}

      {isModalOpen && (
        <FactoryForm
          onClose={() => setIsModalOpen(false)}
          onSuccess={handleSuccess}
          initialData={editingFactory}
        />
      )}
    </div>
  );
}
