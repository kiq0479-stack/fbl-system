'use client';

import { createClient } from '@/lib/supabase/client';
import { Database } from '@/types/database';
import { useEffect, useState } from 'react';
import SupplyTable from '@/components/supplies/SupplyTable';
import SupplyForm from '@/components/supplies/SupplyForm';

type Supply = Database['public']['Tables']['supplies']['Row'];

export default function SuppliesPage() {
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupply, setEditingSupply] = useState<Supply | null>(null);

  const fetchSupplies = async () => {
    setLoading(true);
    const supabase = createClient();
    let query = supabase.from('supplies').select('*').order('created_at', { ascending: false });

    if (search) {
      query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching supplies:', error);
    } else {
      setSupplies(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSupplies();
  }, [search]);

  const handleCreate = () => {
    setEditingSupply(null);
    setIsModalOpen(true);
  };

  const handleEdit = (supply: Supply) => {
    setEditingSupply(supply);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('정말 이 부자재를 삭제하시겠습니까?')) return;

    const supabase = createClient();
    const { error } = await supabase.from('supplies').delete().eq('id', id);

    if (error) {
      alert('삭제 중 오류가 발생했습니다.');
      console.error(error);
    } else {
      fetchSupplies();
    }
  };

  const handleFormSuccess = () => {
    setIsModalOpen(false);
    fetchSupplies();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">부자재 관리</h1>
          <p className="text-sm text-slate-500 mt-1">등록된 부자재 목록을 조회하고 관리합니다.</p>
        </div>
        <button
          onClick={handleCreate}
          className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          부자재 등록
        </button>
      </div>

      <div className="flex items-center gap-4 bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-md leading-5 bg-white placeholder-slate-400 focus:outline-none focus:placeholder-slate-500 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            placeholder="부자재명 또는 SKU 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
           <div className="flex flex-col items-center gap-3">
             <svg className="animate-spin h-8 w-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
             </svg>
             <span className="text-slate-400 text-sm">로딩중...</span>
          </div>
        </div>
      ) : (
        <SupplyTable supplies={supplies} onEdit={handleEdit} onDelete={handleDelete} />
      )}

      {isModalOpen && (
        <SupplyForm
          onClose={() => setIsModalOpen(false)}
          onSuccess={handleFormSuccess}
          initialData={editingSupply}
        />
      )}
    </div>
  );
}
