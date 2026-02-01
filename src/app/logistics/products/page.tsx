'use client';

import { createClient } from '@/lib/supabase/client';
import { Database } from '@/types/database';
import { useEffect, useState } from 'react';
import ProductTable from '@/components/products/ProductTable';
import ProductForm from '@/components/products/ProductForm';
type Product = Database['public']['Tables']['products']['Row'];
type Factory = Database['public']['Tables']['factories']['Row'];

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const fetchProducts = async () => {
    setLoading(true);
    const supabase = createClient();
    let query = supabase.from('products').select('*').order('created_at', { ascending: false });

    if (search) {
      query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching products:', error);
    } else {
      setProducts(data || []);
    }
    setLoading(false);
  };

  const fetchFactories = async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('factories')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching factories:', error);
    } else {
      setFactories(data || []);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchFactories();
  }, [search]); // Re-fetch when search changes (debounce could be added for better performance)

  const handleCreate = () => {
    setEditingProduct(null);
    setIsModalOpen(true);
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('정말 이 상품을 삭제하시겠습니까?')) return;

    const supabase = createClient();
    const { error } = await supabase.from('products').delete().eq('id', id);

    if (error) {
      alert('삭제 중 오류가 발생했습니다.');
      console.error(error);
    } else {
      fetchProducts();
    }
  };

  const handleFormSuccess = () => {
    setIsModalOpen(false);
    fetchProducts();
  };

  // 쿠팡 상품 동기화
  const handleSyncCoupang = async () => {
    if (!confirm('쿠팡에서 상품 정보를 동기화합니다.\n(기존 상품은 유지되고, 상품명/바코드만 업데이트됩니다)\n\n계속하시겠습니까?')) {
      return;
    }
    
    setSyncing(true);
    try {
      const res = await fetch(`/api/products/sync-coupang?sort=${sortOrder}`, {
        method: 'POST',
      });
      
      const data = await res.json();
      
      if (res.ok) {
        alert(data.message);
        fetchProducts();
      } else {
        alert(`동기화 실패: ${data.error}`);
      }
    } catch (error) {
      console.error('Sync error:', error);
      alert('동기화 중 오류가 발생했습니다.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">상품 관리</h1>
          <p className="text-sm text-slate-500 mt-1">등록된 상품을 조회하고 관리합니다.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSyncCoupang}
            disabled={syncing}
            className="inline-flex items-center justify-center px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
          >
            {syncing ? '동기화 중...' : '쿠팡 동기화'}
          </button>
          <button
            onClick={handleCreate}
            className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
          >
            상품 등록
          </button>
        </div>
      </div>

      <div>
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
                placeholder="상품명 또는 모델명 검색"
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
            <ProductTable 
              products={[...products].sort((a, b) => 
                sortOrder === 'asc' 
                  ? a.name.localeCompare(b.name, 'ko')
                  : b.name.localeCompare(a.name, 'ko')
              )} 
              onEdit={handleEdit} 
              onDelete={handleDelete}
              sortOrder={sortOrder}
              onSortChange={setSortOrder}
            />
          )}
      </div>

      {isModalOpen && (
        <ProductForm
          onClose={() => setIsModalOpen(false)}
          onSuccess={handleFormSuccess}
          initialData={editingProduct}
          factories={factories}
        />
      )}
    </div>
  );
}
