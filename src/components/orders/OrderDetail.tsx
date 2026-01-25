'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/types/database';
import OrderItemsTable, { OrderItemWithProduct } from './OrderItemsTable';
import { useRouter } from 'next/navigation';
import { SupabaseClient } from '@supabase/supabase-js';

type Order = Database['public']['Tables']['orders']['Row'];
type OrderItemChange = Database['public']['Tables']['order_item_changes']['Row'];
type OrderStatus = Database['public']['Enums']['order_status'];
type Product = Database['public']['Tables']['products']['Row'];

interface OrderDetailProps {
  id: string;
}

const statusMap: Record<OrderStatus, { label: string; className: string; step: number }> = {
  requested: { label: '요청', className: 'bg-yellow-100 text-yellow-800', step: 1 },
  pre_registered: { label: 'PRE등록', className: 'bg-blue-100 text-blue-800', step: 2 },
  shipping: { label: '선적중', className: 'bg-purple-100 text-purple-800', step: 3 },
  commercial_confirmed: { label: 'COMMERCIAL확정', className: 'bg-green-100 text-green-800', step: 4 },
  arrived: { label: '도착완료', className: 'bg-slate-100 text-slate-800', step: 5 },
};

export default function OrderDetail({ id }: OrderDetailProps) {
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItemWithProduct[]>([]);
  const [changes, setChanges] = useState<OrderItemChange[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Commercial Edit Mode
  const [isCommercialMode, setIsCommercialMode] = useState(false);
  const [commercialValues, setCommercialValues] = useState<Record<string, number>>({});

  // Product Search & Add
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const supabase: SupabaseClient<Database> = createClient();

  const fetchData = useCallback(async () => {
    setLoading(true);
    // Fetch Order
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();

    if (orderError) {
      console.error('Error fetching order:', orderError);
      setLoading(false);
      return;
    }
    setOrder(orderData);

    // Fetch Items
    const { data: itemsData, error: itemsError } = await supabase
      .from('order_items')
      .select('*, product:products(*)')
      .eq('order_id', id);

    if (itemsError) {
      console.error('Error fetching items:', itemsError);
    } else {
      // Cast the result because of the join
      const castedItems = (itemsData as any) as OrderItemWithProduct[];
      setItems(castedItems);
      
      // Initialize commercial values if existing
      const initialValues: Record<string, number> = {};
      castedItems.forEach(item => {
        if (item.commercial_qty !== null) {
          initialValues[item.id] = item.commercial_qty;
        } else {
          initialValues[item.id] = item.pre_qty; // Default to PRE qty
        }
      });
      setCommercialValues(initialValues);

      // Fetch Changes History
      if (castedItems && castedItems.length > 0) {
        const itemIds = castedItems.map(i => i.id);
        const { data: changesData } = await supabase
          .from('order_item_changes')
          .select('*')
          .in('order_item_id', itemIds)
          .order('changed_at', { ascending: false });
        
        setChanges(changesData || []);
      }
    }
    setLoading(false);
  }, [id, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Product search effect
  useEffect(() => {
    const searchProducts = async () => {
      if (!searchQuery.trim()) {
        setSearchResults([]);
        return;
      }
      setIsSearching(true);
      const { data } = await supabase
        .from('products')
        .select('*')
        .or(`name.ilike.%${searchQuery}%,sku.ilike.%${searchQuery}%`)
        .limit(5);
      
      setSearchResults(data || []);
      setIsSearching(false);
    };

    const timeoutId = setTimeout(searchProducts, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery, supabase]);

  // 총 CBM, 총 금액 재계산 및 orders 테이블 업데이트
  const recalculateOrderTotals = async () => {
    // 현재 품목 다시 조회
    const { data: currentItems } = await supabase
      .from('order_items')
      .select('*, product:products(cbm)')
      .eq('order_id', id);

    if (!currentItems) return;

    const totalCbm = currentItems.reduce((acc, item: any) => {
      const qty = item.commercial_qty ?? item.pre_qty;
      const cbm = item.product?.cbm || 0;
      return acc + (qty * cbm);
    }, 0);

    const totalAmountUsd = currentItems.reduce((acc, item: any) => {
      const qty = item.commercial_qty ?? item.pre_qty;
      const price = item.unit_price_usd || 0;
      return acc + (qty * price);
    }, 0);

    const totalAmountRmb = currentItems.reduce((acc, item: any) => {
      const qty = item.commercial_qty ?? item.pre_qty;
      const price = item.unit_price_rmb || 0;
      return acc + (qty * price);
    }, 0);

    // orders 테이블 업데이트
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('orders')
      .update({ 
        total_cbm: Math.round(totalCbm * 100) / 100,
        total_amount_usd: Math.round(totalAmountUsd * 100) / 100,
        total_amount_rmb: Math.round(totalAmountRmb * 100) / 100,
      })
      .eq('id', id);
  };

  const handleAddProduct = async (product: Product) => {
    // Check if already added
    if (items.some(item => item.product_id === product.id)) {
      alert('이미 추가된 상품입니다.');
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('order_items')
        .insert({
          order_id: id,
          product_id: product.id,
          pre_qty: 0,
          unit_price_usd: product.unit_price_usd || 0,
          unit_price_rmb: product.unit_price_rmb || 0,
        });

      if (error) throw error;

      setSearchQuery('');
      setSearchResults([]);
      setShowAddProduct(false);
      await recalculateOrderTotals();
      fetchData();
    } catch (error) {
      console.error('Error adding product:', error);
      alert('상품 추가 중 오류가 발생했습니다.');
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('이 품목을 삭제하시겠습니까?')) return;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('order_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;
      await recalculateOrderTotals();
      fetchData();
    } catch (error) {
      console.error('Error deleting item:', error);
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  const handleUpdateItem = async (itemId: string, updates: { pre_qty?: number; unit_price_usd?: number; unit_price_rmb?: number }) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('order_items')
        .update(updates)
        .eq('id', itemId);

      if (error) throw error;
      await recalculateOrderTotals();
      fetchData();
    } catch (error) {
      console.error('Error updating item:', error);
      alert('수정 중 오류가 발생했습니다.');
    }
  };

  const updateStatus = async (newStatus: OrderStatus) => {
    if (!confirm(`상태를 '${statusMap[newStatus].label}'(으)로 변경하시겠습니까?`)) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('orders')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) {
      alert('상태 변경 실패');
      console.error(error);
    } else {
      fetchData();
    }
  };

  const handleSaveCommercial = async () => {
    if (!confirm('COMMERCIAL 수량을 확정하시겠습니까? 이 작업은 이력에 기록됩니다.')) return;

    try {
      const updates = items.map(async (item) => {
        const newQty = commercialValues[item.id] ?? item.pre_qty;
        const currentQty = item.commercial_qty ?? item.pre_qty; 

        if (newQty !== currentQty || item.commercial_qty === null) {
          // Update order_item
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from('order_items')
            .update({ commercial_qty: newQty })
            .eq('id', item.id);
          
          // Insert history
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from('order_item_changes')
            .insert({
              order_item_id: item.id,
              pre_qty: item.pre_qty, 
              commercial_qty: newQty,
            });
        }
      });

      await Promise.all(updates);

      // Update status if needed
      if (order?.status === 'shipping' || order?.status === 'pre_registered') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('orders').update({ status: 'commercial_confirmed' }).eq('id', id);
      }
      
      await recalculateOrderTotals();
      setIsCommercialMode(false);
      fetchData();
      alert('저장되었습니다.');

    } catch (e) {
      console.error(e);
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">로딩중...</div>;
  if (!order) return <div className="p-8 text-center text-red-500">발주를 찾을 수 없습니다.</div>;

  const currentStep = statusMap[order.status].step;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
             <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
             </svg>
          </button>
          <div>
             <div className="flex items-center gap-3">
               <h1 className="text-2xl font-bold text-slate-900">{order.order_number}</h1>
               <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusMap[order.status].className}`}>
                 {statusMap[order.status].label}
               </span>
             </div>
             <p className="text-slate-500 text-sm mt-1">
               발주 일자: {new Date(order.created_at).toLocaleDateString()}
             </p>
          </div>
        </div>
        
        <div className="flex gap-2">
          {order.status === 'requested' && (
            <button
              onClick={() => updateStatus('pre_registered')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              PRE 등록 완료
            </button>
          )}
          {order.status === 'pre_registered' && (
            <button
              onClick={() => updateStatus('shipping')}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              선적 처리
            </button>
          )}
          {order.status === 'shipping' && (
            <button
              onClick={() => setIsCommercialMode(true)}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              COMMERCIAL 수량 입력
            </button>
          )}
          {order.status === 'commercial_confirmed' && (
            <button
              onClick={() => updateStatus('arrived')}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-medium transition-colors"
            >
              도착 완료 처리
            </button>
          )}
          {/* Allow editing commercial if confirmed */}
          {order.status === 'commercial_confirmed' && !isCommercialMode && (
            <button
              onClick={() => setIsCommercialMode(true)}
              className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-600 rounded-lg text-sm font-medium transition-colors"
            >
              수량 수정
            </button>
          )}
        </div>
      </div>

      {/* Progress */}
      <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
        <div className="relative">
          {/* 배경 선 - 동그라미 중심 위치 (top-4 = 16px, 동그라미 높이 32px의 절반) */}
          <div className="absolute top-4 left-0 w-full h-1 bg-slate-100 z-0"></div>
          <div 
            className="absolute top-4 left-0 h-1 bg-blue-500 z-0 transition-all duration-500"
            style={{ width: `${((currentStep - 1) / 4) * 100}%` }}
          ></div>
          <div className="relative z-10 flex justify-between w-full">
            {Object.entries(statusMap).map(([key, val], idx) => {
              const active = idx + 1 <= currentStep;
              return (
                <div key={key} className="flex flex-col items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    active ? 'bg-blue-500 text-white shadow-md scale-110' : 'bg-slate-200 text-slate-500'
                  }`}>
                    {idx + 1}
                  </div>
                  <span className={`text-xs font-medium ${active ? 'text-blue-600' : 'text-slate-400'}`}>
                    {val.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Basic Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Supplier</h3>
          <p className="text-lg font-medium text-slate-900">{order.supplier}</p>
        </div>
        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Vessel</h3>
          <p className="text-lg font-medium text-slate-900">{order.ship_name || '-'}</p>
        </div>
        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Schedule</h3>
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">ETD</span>
              <span className="font-medium">{order.etd || '-'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">ETA</span>
              <span className="font-medium">{order.eta || '-'}</span>
            </div>
          </div>
        </div>
        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Summary</h3>
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Total CBM</span>
              <span className="font-medium">{order.total_cbm?.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">RMB</span>
              <span className="font-medium text-orange-600">¥{order.total_amount_rmb?.toLocaleString() || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">USD</span>
              <span className="font-medium text-blue-600">${order.total_amount_usd?.toLocaleString() || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Info */}
      {(() => {
        const preTotal = items.reduce((acc, item) => acc + ((item.unit_price_usd || 0) * item.pre_qty), 0);
        const commercialTotal = items.reduce((acc, item) => acc + ((item.unit_price_usd || 0) * (item.commercial_qty ?? item.pre_qty)), 0);
        const deposit = Math.round(preTotal * 0.3 * 100) / 100; // 선금: PRE 30%
        const balance = Math.round((commercialTotal - deposit) * 100) / 100; // 잔금: COMMERCIAL - 선금

        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <h3 className="text-xs font-bold text-blue-600 uppercase mb-2">PRE 총금액</h3>
              <p className="text-xl font-bold text-blue-700">${preTotal.toLocaleString()}</p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <h3 className="text-xs font-bold text-green-600 uppercase mb-2">선금 (30%)</h3>
              <p className="text-xl font-bold text-green-700">${deposit.toLocaleString()}</p>
            </div>
            <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
              <h3 className="text-xs font-bold text-orange-600 uppercase mb-2">잔금</h3>
              <p className="text-xl font-bold text-orange-700">${balance.toLocaleString()}</p>
              {items.some(item => item.commercial_qty !== null) && (
                <p className="text-xs text-orange-500 mt-1">COMMERCIAL 기준: ${commercialTotal.toLocaleString()}</p>
              )}
            </div>
          </div>
        );
      })()}

      {/* Items Table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <span className="w-1 h-6 bg-slate-800 rounded-full"></span>
            발주 품목
          </h2>
          <div className="flex gap-2">
            {isCommercialMode ? (
              <>
                <button 
                  onClick={() => setIsCommercialMode(false)}
                  className="px-3 py-1.5 text-slate-500 hover:text-slate-700 text-sm font-medium"
                >
                  취소
                </button>
                <button 
                  onClick={handleSaveCommercial}
                  className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium shadow-sm transition-colors"
                >
                  변경사항 확정
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowAddProduct(!showAddProduct)}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium shadow-sm transition-colors flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                품목 추가
              </button>
            )}
          </div>
        </div>

        {/* Product Search */}
        {showAddProduct && (
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="상품명 또는 SKU로 검색..."
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                autoFocus
              />
              <svg className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            {searchQuery && (
              <div className="mt-2 border border-slate-200 rounded-lg max-h-60 overflow-y-auto">
                {isSearching ? (
                  <div className="p-4 text-center text-slate-500 text-sm">검색중...</div>
                ) : searchResults.length > 0 ? (
                  <ul className="divide-y divide-slate-100">
                    {searchResults.map((product) => (
                      <li
                        key={product.id}
                        onClick={() => handleAddProduct(product)}
                        className="p-3 hover:bg-blue-50 cursor-pointer transition-colors flex justify-between items-center"
                      >
                        <div>
                          <div className="font-medium text-slate-900">{product.name}</div>
                          <div className="text-xs text-slate-500">SKU: {product.sku}</div>
                        </div>
                        <div className="text-xs text-slate-400">
                          {product.unit_price_rmb && <span className="mr-2">¥{product.unit_price_rmb}</span>}
                          {product.unit_price_usd && <span>${product.unit_price_usd}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="p-4 text-center text-slate-500 text-sm">검색 결과가 없습니다.</div>
                )}
              </div>
            )}
          </div>
        )}

        <OrderItemsTable 
          items={items} 
          isCommercialMode={isCommercialMode}
          onCommercialChange={setCommercialValues}
          commercialValues={commercialValues}
          onUpdateItem={handleUpdateItem}
          onDeleteItem={handleDeleteItem}
        />
      </div>

      {/* History */}
      {changes.length > 0 && (
        <div className="space-y-4 pt-8 border-t border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
             <span className="w-1 h-6 bg-slate-400 rounded-full"></span>
             변경 이력
          </h2>
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3">변경 일시</th>
                  <th className="px-6 py-3">품목</th>
                  <th className="px-6 py-3 text-right">PRE</th>
                  <th className="px-6 py-3 text-right">COMMERCIAL</th>
                  <th className="px-6 py-3 text-right">변경량</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {changes.map((change) => {
                  const item = items.find(i => i.id === change.order_item_id);
                  return (
                    <tr key={change.id} className="hover:bg-slate-50">
                      <td className="px-6 py-3 text-slate-500">
                        {new Date(change.changed_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-3 font-medium text-slate-900">
                        {item?.product.name || 'Unknown Product'}
                      </td>
                      <td className="px-6 py-3 text-right text-slate-600">
                        {change.pre_qty}
                      </td>
                      <td className="px-6 py-3 text-right text-slate-900 font-medium">
                        {change.commercial_qty}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                           change.diff_qty > 0 ? 'bg-green-100 text-green-700' : 
                           change.diff_qty < 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {change.diff_qty > 0 ? '+' : ''}{change.diff_qty}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
