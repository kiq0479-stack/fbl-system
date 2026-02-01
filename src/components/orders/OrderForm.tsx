'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/types/database';
import { SupabaseClient } from '@supabase/supabase-js';

type Product = Database['public']['Tables']['products']['Row'];
type Factory = Database['public']['Tables']['factories']['Row'];
type OrderStatus = Database['public']['Enums']['order_status'];

interface OrderFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface OrderItemInput {
  product: Product;
  pre_qty: number;
  unit_price_usd: number;
  unit_price_rmb: number;
}

export default function OrderForm({ onClose, onSuccess }: OrderFormProps) {
  const [loading, setLoading] = useState(false);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [factoryId, setFactoryId] = useState<string>('');
  const [shipName, setShipName] = useState('');
  const [etd, setEtd] = useState('');
  const [eta, setEta] = useState('');
  const [orderNumber, setOrderNumber] = useState('');

  // Product Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // Selected Items
  const [items, setItems] = useState<OrderItemInput[]>([]);

  const supabase: SupabaseClient<Database> = createClient();

  useEffect(() => {
    // Auto-generate Order Number: PO-YYYYMMDD-Random
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    setOrderNumber(`PO-${date}-${random}`);

    // Fetch factories for supplier dropdown
    const fetchFactories = async () => {
      const { data } = await supabase
        .from('factories')
        .select('*')
        .eq('is_active', true)
        .order('name');
      setFactories(data || []);
    };
    fetchFactories();
  }, []);

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

  const handleAddItem = (product: Product) => {
    if (items.some(item => item.product.id === product.id)) {
      alert('이미 추가된 상품입니다.');
      return;
    }
    setItems([...items, { 
      product, 
      pre_qty: 0, 
      unit_price_usd: product.unit_price_usd || 0,
      unit_price_rmb: product.unit_price_rmb || 0,
    }]);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: 'pre_qty' | 'unit_price_usd' | 'unit_price_rmb', value: number) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const calculateTotalCBM = () => {
    return items.reduce((sum, item) => sum + (item.pre_qty * (item.product.cbm || 0)), 0);
  };

  const calculateTotalAmountUsd = () => {
    return items.reduce((sum, item) => sum + (item.pre_qty * item.unit_price_usd), 0);
  };

  const calculateTotalAmountRmb = () => {
    return items.reduce((sum, item) => sum + (item.pre_qty * item.unit_price_rmb), 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) {
      alert('최소 1개의 상품을 추가해주세요.');
      return;
    }

    setLoading(true);

    try {
      // 1. Create Order
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: orderData, error: orderError } = await (supabase as any)
        .from('orders')
        .insert({
          order_number: orderNumber,
          supplier: 'OTHER',
          factory_id: factoryId || null,
          status: 'requested',
          ship_name: shipName || null,
          etd: etd || null,
          eta: eta || null,
          total_cbm: calculateTotalCBM(),
          total_amount_usd: calculateTotalAmountUsd(),
          total_amount_rmb: calculateTotalAmountRmb(),
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // 2. Create Order Items
      const orderItemsData = items.map(item => ({
        order_id: orderData.id,
        product_id: item.product.id,
        pre_qty: item.pre_qty,
        unit_price_usd: item.unit_price_usd,
        unit_price_rmb: item.unit_price_rmb,
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: itemsError } = await (supabase as any)
        .from('order_items')
        .insert(orderItemsData);

      if (itemsError) throw itemsError;

      onSuccess();
    } catch (error) {
      console.error('Error creating order:', error);
      alert('발주 등록 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-xl font-bold text-slate-800">신규 발주 등록</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Basic Info */}
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-1">
              <label className="text-sm font-semibold text-slate-700">발주번호</label>
              <input
                type="text"
                value={orderNumber}
                readOnly
                className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-500 font-mono text-sm focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold text-slate-700">공장 (Supplier)</label>
              <select
                value={factoryId}
                onChange={(e) => setFactoryId(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm"
              >
                <option value="">선택하세요</option>
                {factories.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold text-slate-700">선박명</label>
              <input
                type="text"
                value={shipName}
                onChange={(e) => setShipName(e.target.value)}
                placeholder="선박명 입력"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold text-slate-700">ETD (출발)</label>
              <input
                type="date"
                value={etd}
                onChange={(e) => setEtd(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold text-slate-700">ETA (도착)</label>
              <input
                type="date"
                value={eta}
                onChange={(e) => setEta(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm"
              />
            </div>
          </section>

          {/* Product Selection */}
          <section className="space-y-4">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <span className="w-1 h-6 bg-blue-500 rounded-full"></span>
              품목 관리
            </h3>
            
            <div className="relative z-10">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="상품명 또는 SKU로 검색하여 추가..."
                  className="w-full pl-10 pr-4 py-3 bg-white border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm"
                />
                <svg className="w-5 h-5 text-slate-400 absolute left-3 top-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              {/* Search Results Dropdown */}
              {searchQuery && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                  {isSearching ? (
                    <div className="p-4 text-center text-slate-500 text-sm">검색중...</div>
                  ) : searchResults.length > 0 ? (
                    <ul className="divide-y divide-slate-100">
                      {searchResults.map((product) => (
                        <li 
                          key={product.id}
                          onClick={() => handleAddItem(product)}
                          className="p-3 hover:bg-blue-50 cursor-pointer transition-colors flex justify-between items-center group"
                        >
                          <div>
                            <div className="font-medium text-slate-900 group-hover:text-blue-700">{product.name}</div>
                            <div className="text-xs text-slate-500">SKU: {product.sku}</div>
                          </div>
                          <div className="text-xs text-slate-400 group-hover:text-blue-600">추가 +</div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="p-4 text-center text-slate-500 text-sm">검색 결과가 없습니다.</div>
                  )}
                </div>
              )}
            </div>

            {/* Selected Items Table */}
            {items.length > 0 && (
              <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-600 font-medium">
                    <tr>
                      <th className="px-4 py-3">상품 정보</th>
                      <th className="px-4 py-3 w-24 text-right">PRE 수량</th>
                      <th className="px-4 py-3 w-28 text-right">단가 (RMB)</th>
                      <th className="px-4 py-3 w-28 text-right">단가 (USD)</th>
                      <th className="px-4 py-3 w-28 text-right">금액</th>
                      <th className="px-4 py-3 w-24 text-right">CBM</th>
                      <th className="px-4 py-3 w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {items.map((item, index) => (
                      <tr key={item.product.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{item.product.name}</div>
                          <div className="text-xs text-slate-500">{item.product.sku}</div>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="1"
                            value={item.pre_qty}
                            onChange={(e) => handleItemChange(index, 'pre_qty', parseInt(e.target.value) || 0)}
                            className="w-full px-2 py-1 text-right border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 outline-none"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unit_price_rmb}
                            onChange={(e) => handleItemChange(index, 'unit_price_rmb', parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1 text-right border border-slate-300 rounded focus:ring-1 focus:ring-orange-500 outline-none"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unit_price_usd}
                            onChange={(e) => handleItemChange(index, 'unit_price_usd', parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1 text-right border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 outline-none"
                          />
                        </td>
                        <td className="px-4 py-3 text-right text-xs">
                          <div className="text-orange-600">¥{(item.pre_qty * item.unit_price_rmb).toLocaleString()}</div>
                          <div className="text-slate-500">${(item.pre_qty * item.unit_price_usd).toLocaleString()}</div>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {(item.pre_qty * (item.product.cbm || 0)).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(index)}
                            className="text-red-400 hover:text-red-600 p-1"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 font-semibold text-slate-800">
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-right">합계</td>
                      <td className="px-4 py-3 text-right text-xs">
                        <div className="text-orange-600">¥{calculateTotalAmountRmb().toLocaleString()}</div>
                        <div className="text-slate-600">${calculateTotalAmountUsd().toLocaleString()}</div>
                      </td>
                      <td className="px-4 py-3 text-right">{calculateTotalCBM().toFixed(2)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        </form>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg font-medium text-sm transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || items.length === 0}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm shadow-sm transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                처리중...
              </>
            ) : (
              '발주 등록'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
