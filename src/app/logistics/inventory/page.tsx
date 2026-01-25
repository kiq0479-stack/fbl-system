'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { InventoryLocation } from '@/types/database';
import InventoryModal from '@/components/inventory/InventoryModal';
import WarehouseEditModal from '@/components/inventory/WarehouseEditModal';

type InventoryItem = {
  id: string;
  product_id: string | null;
  supply_id: string | null;
  location: InventoryLocation;
  quantity: number;
  pallet_count: number | null;
  extra_boxes: number | null;
  rack_position: string | null;
  updated_at: string;
  products?: { name: string; sku: string; external_sku: string | null; pallet_qty: number | null } | null;
  supplies?: { name: string; sku: string } | null;
};

// 입고중 데이터 타입
type InboundItem = {
  sku: string;
  product_name: string;
  quantity: number;
  box_quantity: number;
  pallet_number: number;
  request_number: string;
  expected_date: string;
};

// 선적중 데이터 타입 (발주 기반)
type InTransitItem = {
  sku: string;
  product_name: string;
  quantity: number;
  order_number: string;
  eta: string | null;
};

// 발주요청 데이터 타입 (requested, pre_registered 상태)
type OrderRequestedItem = {
  sku: string;
  product_name: string;
  quantity: number;
  order_number: string;
};

// 합산된 재고 타입 (전체 뷰용)
type AggregatedItem = {
  sku: string;
  name: string;
  warehouse: number;
  coupang: number;
  coupang_inbound: number;
  order_requested: number;
  in_transit: number;
  total: number;
  updated_at: string;
};

const locationLabels: Record<InventoryLocation, string> = {
  warehouse: '창고',
  coupang: '쿠팡',
  naver: '네이버',
  in_transit: '선적중',
};

const locationColors: Record<InventoryLocation, string> = {
  warehouse: 'bg-blue-100 text-blue-800',
  coupang: 'bg-orange-100 text-orange-800',
  naver: 'bg-green-100 text-green-800',
  in_transit: 'bg-purple-100 text-purple-800',
};

export default function InventoryPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [inboundItems, setInboundItems] = useState<InboundItem[]>([]);
  const [inTransitItems, setInTransitItems] = useState<InTransitItem[]>([]);
  const [orderRequestedItems, setOrderRequestedItems] = useState<OrderRequestedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'product' | 'supply' | 'coupang_inbound'>('product');
  const [locationFilter, setLocationFilter] = useState<InventoryLocation | 'all'>('all');
  const [modalType, setModalType] = useState<'in' | 'out' | 'transfer' | null>(null);
  const [syncingCoupang, setSyncingCoupang] = useState(false);
  const [editingWarehouseItem, setEditingWarehouseItem] = useState<InventoryItem | null>(null);
  const [selectedProductSku, setSelectedProductSku] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [selectedSupplySku, setSelectedSupplySku] = useState<string | null>(null);
  const [selectedSupply, setSelectedSupply] = useState<any>(null);
  
  // 검색 & 정렬
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  const supabase = createClient();

  useEffect(() => {
    if (activeTab === 'coupang_inbound') {
      fetchInboundItems();
    } else {
      fetchInventory();
      // 전체 뷰에서 입고중/선적중/발주요청 데이터도 함께 불러오기
      if (activeTab === 'product' && locationFilter === 'all') {
        fetchInboundItems(false);  // 로딩 표시 없이 백그라운드에서 불러오기
        fetchInTransitItems();     // 선적중 데이터 불러오기
        fetchOrderRequestedItems(); // 발주요청 데이터 불러오기
      }
    }
  }, [activeTab, locationFilter]);

  // 상품 정보 팝업용 데이터 조회
  useEffect(() => {
    if (!selectedProductSku) {
      setSelectedProduct(null);
      return;
    }
    const fetchProduct = async () => {
      const { data } = await supabase
        .from('products')
        .select('*')
        .eq('sku', selectedProductSku)
        .single();
      setSelectedProduct(data);
    };
    fetchProduct();
  }, [selectedProductSku]);

  // 부자재 정보 팝업용 데이터 조회
  useEffect(() => {
    if (!selectedSupplySku) {
      setSelectedSupply(null);
      return;
    }
    const fetchSupply = async () => {
      const { data } = await supabase
        .from('supplies')
        .select('*')
        .eq('sku', selectedSupplySku)
        .single();
      setSelectedSupply(data);
    };
    fetchSupply();
  }, [selectedSupplySku]);

  const fetchInventory = async () => {
    setLoading(true);
    
    let query = supabase
      .from('inventory')
      .select(`
        *,
        products (name, sku, external_sku, pallet_qty),
        supplies (name, sku)
      `);

    if (activeTab === 'product') {
      query = query.not('product_id', 'is', null);
    } else if (activeTab === 'supply') {
      query = query.not('supply_id', 'is', null);
    }

    if (locationFilter !== 'all') {
      query = query.eq('location', locationFilter);
    }

    const { data, error } = await query.order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching inventory:', error);
    } else {
      setInventory(data || []);
    }
    setLoading(false);
  };

  const fetchInboundItems = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('inbound_items')
        .select(`
          sku,
          product_name,
          quantity,
          box_quantity,
          pallet_number,
          inbound_request:inbound_requests!inner(
            request_number,
            expected_date,
            status
          )
        `)
        .in('inbound_request.status', ['pending', 'in_transit']);
      
      if (data) {
        const items: InboundItem[] = data.map((item: any) => ({
          sku: item.sku,
          product_name: item.product_name,
          quantity: item.quantity,
          box_quantity: item.box_quantity,
          pallet_number: item.pallet_number,
          request_number: item.inbound_request?.request_number || '',
          expected_date: item.inbound_request?.expected_date || '',
        }));
        setInboundItems(items);
      }
    } catch (err) {
      console.error('Failed to fetch inbound items:', err);
    }
    if (showLoading) setLoading(false);
  };

  // 선적중 데이터 가져오기 (발주 기반)
  const fetchInTransitItems = async () => {
    try {
      // shipping 또는 commercial_confirmed 상태의 주문에서 품목 가져오기
      const { data, error } = await supabase
        .from('order_items')
        .select(`
          pre_qty,
          commercial_qty,
          product:products(name, sku),
          order:orders!inner(order_number, eta, status)
        `)
        .in('order.status', ['shipping', 'commercial_confirmed']);
      
      if (error) {
        console.error('Error fetching in-transit items:', error);
        return;
      }

      if (data) {
        const items: InTransitItem[] = data.map((item: any) => ({
          sku: item.product?.sku || '',
          product_name: item.product?.name || '',
          quantity: item.commercial_qty ?? item.pre_qty,
          order_number: item.order?.order_number || '',
          eta: item.order?.eta || null,
        }));
        setInTransitItems(items);
      }
    } catch (err) {
      console.error('Failed to fetch in-transit items:', err);
    }
  };

  // 발주요청 데이터 가져오기 (requested, pre_registered 상태)
  const fetchOrderRequestedItems = async () => {
    try {
      const { data, error } = await supabase
        .from('order_items')
        .select(`
          pre_qty,
          product:products(name, sku),
          order:orders!inner(order_number, status)
        `)
        .in('order.status', ['requested', 'pre_registered']);
      
      if (error) {
        console.error('Error fetching order requested items:', error);
        return;
      }

      if (data) {
        const items: OrderRequestedItem[] = data.map((item: any) => ({
          sku: item.product?.sku || '',
          product_name: item.product?.name || '',
          quantity: item.pre_qty,
          order_number: item.order?.order_number || '',
        }));
        setOrderRequestedItems(items);
      }
    } catch (err) {
      console.error('Failed to fetch order requested items:', err);
    }
  };

  const getName = (item: InventoryItem) => {
    return item.products?.name || item.supplies?.name || '-';
  };

  const getSku = (item: InventoryItem) => {
    return item.products?.sku || item.supplies?.sku || '-';
  };

  // 전체 뷰: SKU별 합산 데이터 생성
  const aggregatedItems: AggregatedItem[] = (() => {
    if (locationFilter !== 'all') return [];
    
    const map = new Map<string, AggregatedItem>();
    
    // external_sku -> sku 매핑 (입고중 데이터 매칭용)
    const externalSkuToSku = new Map<string, string>();
    inventory.forEach(item => {
      if (item.products?.external_sku && item.products?.sku) {
        externalSkuToSku.set(item.products.external_sku, item.products.sku);
      }
    });
    
    // 기존 재고 데이터 합산
    inventory.forEach(item => {
      const sku = getSku(item);
      const name = getName(item);
      if (sku === '-') return;
      
      if (!map.has(sku)) {
        map.set(sku, {
          sku,
          name,
          warehouse: 0,
          coupang: 0,
          coupang_inbound: 0,
          order_requested: 0,
          in_transit: 0,
          total: 0,
          updated_at: item.updated_at,
        });
      }
      
      const agg = map.get(sku)!;
      if (item.location === 'warehouse') agg.warehouse += item.quantity;
      else if (item.location === 'coupang') agg.coupang += item.quantity;
      agg.total += item.quantity;
      if (new Date(item.updated_at) > new Date(agg.updated_at)) {
        agg.updated_at = item.updated_at;
      }
    });
    
    // 쿠팡 입고중 데이터 합산 (external_sku로 매칭 시도)
    inboundItems.forEach(item => {
      // external_sku -> sku 매핑 확인
      const matchedSku = externalSkuToSku.get(item.sku) || item.sku;
      
      if (!map.has(matchedSku)) {
        map.set(matchedSku, {
          sku: matchedSku,
          name: item.product_name,
          warehouse: 0,
          coupang: 0,
          coupang_inbound: 0,
          order_requested: 0,
          in_transit: 0,
          total: 0,
          updated_at: new Date().toISOString(),
        });
      }
      
      const agg = map.get(matchedSku)!;
      agg.coupang_inbound += item.quantity;
      agg.total += item.quantity;
    });

    // 선적중 데이터 합산 (발주 기반)
    inTransitItems.forEach(item => {
      if (!item.sku) return;
      
      if (!map.has(item.sku)) {
        map.set(item.sku, {
          sku: item.sku,
          name: item.product_name,
          warehouse: 0,
          coupang: 0,
          coupang_inbound: 0,
          order_requested: 0,
          in_transit: 0,
          total: 0,
          updated_at: new Date().toISOString(),
        });
      }
      
      const agg = map.get(item.sku)!;
      agg.in_transit += item.quantity;
      agg.total += item.quantity;
    });

    // 발주요청 데이터 합산 (requested, pre_registered 상태)
    orderRequestedItems.forEach(item => {
      if (!item.sku) return;
      
      if (!map.has(item.sku)) {
        map.set(item.sku, {
          sku: item.sku,
          name: item.product_name,
          warehouse: 0,
          coupang: 0,
          coupang_inbound: 0,
          order_requested: 0,
          in_transit: 0,
          total: 0,
          updated_at: new Date().toISOString(),
        });
      }
      
      const agg = map.get(item.sku)!;
      agg.order_requested += item.quantity;
      agg.total += item.quantity;
    });
    
    return Array.from(map.values());
  })();

  // 검색 필터
  const filteredInventory = inventory.filter(item => {
    if (!search) return true;
    const name = getName(item).toLowerCase();
    const sku = getSku(item).toLowerCase();
    return name.includes(search.toLowerCase()) || sku.includes(search.toLowerCase());
  });

  const filteredInboundItems = inboundItems.filter(item => {
    if (!search) return true;
    return item.product_name.toLowerCase().includes(search.toLowerCase()) ||
           item.sku.toLowerCase().includes(search.toLowerCase());
  });

  const filteredAggregated = aggregatedItems.filter(item => {
    if (!search) return true;
    return item.name.toLowerCase().includes(search.toLowerCase()) ||
           item.sku.toLowerCase().includes(search.toLowerCase());
  });

  // 정렬
  const sortedInventory = [...filteredInventory].sort((a, b) => {
    const nameA = getName(a);
    const nameB = getName(b);
    const comparison = nameA.localeCompare(nameB, 'ko');
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  const sortedInboundItems = [...filteredInboundItems].sort((a, b) => {
    const comparison = a.product_name.localeCompare(b.product_name, 'ko');
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  const sortedAggregated = [...filteredAggregated].sort((a, b) => {
    const comparison = a.name.localeCompare(b.name, 'ko');
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  // 입고중 총 수량
  const totalInboundQty = inboundItems.reduce((sum, item) => sum + item.quantity, 0);

  // 쿠팡 재고 동기화
  const handleSyncCoupangInventory = async () => {
    if (!confirm('쿠팡 로켓그로스 재고를 동기화합니다.\n계속하시겠습니까?')) {
      return;
    }
    
    setSyncingCoupang(true);
    try {
      const res = await fetch('/api/inventory/sync-coupang', {
        method: 'POST',
      });
      
      const data = await res.json();
      
      if (res.ok) {
        alert(data.message);
        fetchInventory();
      } else {
        alert(`동기화 실패: ${data.error}`);
      }
    } catch (error) {
      console.error('Sync error:', error);
      alert('동기화 중 오류가 발생했습니다.');
    } finally {
      setSyncingCoupang(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">재고 관리</h1>
        <div className="flex gap-2">
          {activeTab === 'product' && (
            <button
              onClick={handleSyncCoupangInventory}
              disabled={syncingCoupang}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:bg-orange-400 transition-colors text-sm font-medium flex items-center gap-2"
            >
              {syncingCoupang ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  동기화 중...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  쿠팡 재고 동기화
                </>
              )}
            </button>
          )}
          <button
            onClick={() => setModalType('in')}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
          >
            + 입고
          </button>
          <button
            onClick={() => setModalType('out')}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
          >
            - 출고
          </button>
          <button
            onClick={() => setModalType('transfer')}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
          >
            ↔ 이동
          </button>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('product')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'product'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          상품 재고
        </button>
        <button
          onClick={() => {
            setActiveTab('supply');
            setLocationFilter('warehouse'); // 부자재는 창고만
          }}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'supply'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          부자재 재고
        </button>
      </div>

      {/* 위치 필터 (상품 탭에서만) */}
      {activeTab === 'product' && (
        <div className="flex gap-2 flex-wrap items-center">
          <button
            onClick={() => setLocationFilter('all')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              locationFilter === 'all'
                ? 'bg-slate-800 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            전체
          </button>
          {/* 창고 */}
          <button
            onClick={() => setLocationFilter('warehouse')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              locationFilter === 'warehouse'
                ? 'bg-slate-800 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            창고
          </button>
          {/* 쿠팡 */}
          <button
            onClick={() => setLocationFilter('coupang')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              locationFilter === 'coupang'
                ? 'bg-slate-800 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            쿠팡
          </button>
          {/* 쿠팡 입고중 */}
          <button
            onClick={() => setActiveTab('coupang_inbound')}
            className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200"
          >
            쿠팡 입고중
            {totalInboundQty > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-200">
                {totalInboundQty.toLocaleString()}
              </span>
            )}
          </button>
          {/* 선적중 */}
          <button
            onClick={() => setLocationFilter('in_transit')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              locationFilter === 'in_transit'
                ? 'bg-slate-800 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            선적중
          </button>
        </div>
      )}
      
      {/* 쿠팡 입고중 탭에서 돌아가기 */}
      {activeTab === 'coupang_inbound' && (
        <div className="flex gap-2 items-center">
          <button
            onClick={() => setActiveTab('product')}
            className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors bg-slate-100 text-slate-600 hover:bg-slate-200"
          >
            ← 재고 목록
          </button>
          <span className="px-3 py-1.5 rounded-full text-sm font-medium bg-orange-600 text-white flex items-center gap-1.5">
            쿠팡 입고중
            {totalInboundQty > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-500">
                {totalInboundQty.toLocaleString()}
              </span>
            )}
          </span>
        </div>
      )}

      {/* 검색 & 정렬 */}
      <div className="flex items-center gap-4">
        <input
          type="text"
          placeholder="상품명, SKU 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
        />
        {search && (
          <button onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600">✕</button>
        )}
        <button
          onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
          className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm text-slate-600 flex items-center gap-1"
        >
          상품명 {sortOrder === 'asc' ? '↑' : '↓'}
        </button>
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {activeTab === 'coupang_inbound' ? (
          // 쿠팡 입고중 테이블
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">상품명</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">옵션ID</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">수량</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">박스</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">파레트</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">입고요청번호</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">도착예정일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">로딩중...</td>
                </tr>
              ) : sortedInboundItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    입고중인 상품이 없습니다
                  </td>
                </tr>
              ) : (
                sortedInboundItems.map((item, idx) => (
                  <tr key={idx} className="hover:bg-orange-50/50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">{item.product_name}</td>
                    <td className="px-6 py-4 text-sm text-slate-500 font-mono">{item.sku}</td>
                    <td className="px-6 py-4 text-sm text-right font-semibold text-orange-600">{item.quantity.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-right text-slate-500">{item.box_quantity}</td>
                    <td className="px-6 py-4 text-sm text-center">
                      <span className="px-2 py-1 bg-slate-100 rounded text-slate-600">P{item.pallet_number}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">{item.request_number}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">{item.expected_date}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : locationFilter === 'all' ? (
          // 전체 뷰: SKU별 합산 테이블
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  {activeTab === 'product' ? '상품명' : '부자재명'}
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">창고</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">쿠팡</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-orange-600 uppercase tracking-wider whitespace-nowrap">입고중</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-blue-600 uppercase tracking-wider whitespace-nowrap">발주요청</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-purple-600 uppercase tracking-wider whitespace-nowrap">선적중</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">합계</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">로딩중...</td>
                </tr>
              ) : sortedAggregated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">재고 데이터가 없습니다</td>
                </tr>
              ) : (
                sortedAggregated.map((item) => (
                  <tr key={item.sku} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium">
                      <button
                        onClick={() => setSelectedProductSku(item.sku)}
                        className="text-slate-900 hover:underline text-left"
                      >
                        {item.name}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-slate-600">{item.warehouse > 0 ? item.warehouse.toLocaleString() : '-'}</td>
                    <td className="px-6 py-4 text-sm text-right text-slate-600">{item.coupang > 0 ? item.coupang.toLocaleString() : '-'}</td>
                    <td className="px-6 py-4 text-sm text-right font-medium text-orange-600">{item.coupang_inbound > 0 ? item.coupang_inbound.toLocaleString() : '-'}</td>
                    <td className="px-6 py-4 text-sm text-right font-medium text-blue-600">{item.order_requested > 0 ? item.order_requested.toLocaleString() : '-'}</td>
                    <td className="px-6 py-4 text-sm text-right font-medium text-purple-600">{item.in_transit > 0 ? item.in_transit.toLocaleString() : '-'}</td>
                    <td className="px-6 py-4 text-sm text-right font-bold text-slate-900">{item.total.toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          // 특정 위치 필터: 기존 테이블
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {activeTab === 'product' ? '상품명' : '부자재명'}
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">옵션ID</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">수량</th>
                {locationFilter === 'warehouse' && activeTab === 'product' && (
                  <th className="px-6 py-4 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">파렛트</th>
                )}
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">랙 위치</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">최종 수정</th>
                {locationFilter === 'warehouse' && activeTab === 'product' && (
                  <th className="px-6 py-4 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">수정</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={locationFilter === 'warehouse' && activeTab === 'product' ? 7 : 5} className="px-6 py-12 text-center text-slate-400">로딩중...</td>
                </tr>
              ) : sortedInventory.length === 0 ? (
                <tr>
                  <td colSpan={locationFilter === 'warehouse' && activeTab === 'product' ? 7 : 5} className="px-6 py-12 text-center text-slate-400">재고 데이터가 없습니다</td>
                </tr>
              ) : (
                sortedInventory.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium">
                      <button
                        onClick={() => {
                          if (activeTab === 'product' && item.products?.sku) {
                            setSelectedProductSku(item.products.sku);
                          } else if (activeTab === 'supply' && item.supplies?.sku) {
                            setSelectedSupplySku(item.supplies.sku);
                          }
                        }}
                        className="text-slate-900 hover:underline text-left"
                      >
                        {getName(item)}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500 font-mono">{getSku(item)}</td>
                    <td className="px-6 py-4 text-sm text-right font-semibold text-slate-900">{item.quantity.toLocaleString()}</td>
                    {locationFilter === 'warehouse' && activeTab === 'product' && (
                      <td className="px-6 py-4 text-sm text-center text-slate-500">
                        {item.pallet_count !== null ? (
                          <span className="text-blue-600 font-medium">
                            {item.pallet_count}P {item.extra_boxes ? `+ ${item.extra_boxes}` : ''}
                          </span>
                        ) : '-'}
                      </td>
                    )}
                    <td className="px-6 py-4 text-sm text-slate-500 font-mono">{item.rack_position || '-'}</td>
                    <td className="px-6 py-4 text-sm text-slate-400">{new Date(item.updated_at).toLocaleDateString('ko-KR')}</td>
                    {locationFilter === 'warehouse' && activeTab === 'product' && (
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => setEditingWarehouseItem(item)}
                          className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          수정
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* 요약 - 상품 재고 전체 뷰에서만 표시 */}
      {activeTab === 'product' && locationFilter === 'all' && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200">
            <div className="text-sm text-slate-500">창고</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              {inventory.filter((i) => i.location === 'warehouse').reduce((sum, i) => sum + i.quantity, 0).toLocaleString()}
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200">
            <div className="text-sm text-slate-500">쿠팡</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              {inventory.filter((i) => i.location === 'coupang').reduce((sum, i) => sum + i.quantity, 0).toLocaleString()}
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-orange-200 bg-orange-50">
            <div className="text-sm text-orange-600">쿠팡 입고중</div>
            <div className="text-2xl font-bold text-orange-700 mt-1">
              {totalInboundQty.toLocaleString()}
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-blue-200 bg-blue-50">
            <div className="text-sm text-blue-600">발주요청</div>
            <div className="text-2xl font-bold text-blue-700 mt-1">
              {orderRequestedItems.reduce((sum, i) => sum + i.quantity, 0).toLocaleString()}
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-purple-200 bg-purple-50">
            <div className="text-sm text-purple-600">선적중</div>
            <div className="text-2xl font-bold text-purple-700 mt-1">
              {inTransitItems.reduce((sum, i) => sum + i.quantity, 0).toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* 부자재 재고 요약 - 창고만 */}
      {activeTab === 'supply' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200">
            <div className="text-sm text-slate-500">창고 부자재</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              {inventory.filter((i) => i.location === 'warehouse').reduce((sum, i) => sum + i.quantity, 0).toLocaleString()}
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200">
            <div className="text-sm text-slate-500">총 품목 수</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              {new Set(inventory.map(i => getSku(i))).size}
            </div>
          </div>
        </div>
      )}

      {/* 쿠팡 입고중 요약 */}
      {activeTab === 'coupang_inbound' && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-orange-600">총 입고중 수량</div>
              <div className="text-2xl font-bold text-orange-700">{totalInboundQty.toLocaleString()}개</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-orange-600">입고중 품목</div>
              <div className="text-2xl font-bold text-orange-700">{new Set(inboundItems.map(i => i.sku)).size}개</div>
            </div>
          </div>
        </div>
      )}

      {/* 입출고 모달 */}
      {modalType && (
        <InventoryModal
          type={modalType}
          itemType={activeTab === 'supply' ? 'supply' : 'product'}
          onClose={() => setModalType(null)}
          onSuccess={() => {
            setModalType(null);
            if (activeTab === 'coupang_inbound') {
              fetchInboundItems();
            } else {
              fetchInventory();
            }
          }}
        />
      )}

      {/* 창고 재고 수정 모달 */}
      {editingWarehouseItem && editingWarehouseItem.product_id && (
        <WarehouseEditModal
          inventoryId={editingWarehouseItem.id}
          productId={editingWarehouseItem.product_id}
          productName={getName(editingWarehouseItem)}
          currentQuantity={editingWarehouseItem.quantity}
          currentPalletCount={editingWarehouseItem.pallet_count}
          currentExtraBoxes={editingWarehouseItem.extra_boxes}
          palletQty={editingWarehouseItem.products?.pallet_qty ?? null}
          onClose={() => setEditingWarehouseItem(null)}
          onSuccess={() => {
            setEditingWarehouseItem(null);
            fetchInventory();
          }}
        />
      )}

      {/* 상품 정보 팝업 */}
      {selectedProductSku && selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedProductSku(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <h2 className="text-lg font-bold text-slate-900">상품 정보</h2>
              <button onClick={() => setSelectedProductSku(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <div className="text-sm text-slate-500">상품명</div>
                <div className="text-lg font-semibold text-slate-900">{selectedProduct.name}</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-slate-500">SKU (옵션ID)</div>
                  <div className="font-mono text-slate-800">{selectedProduct.sku}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-500">바코드</div>
                  <div className="font-mono text-slate-800">{selectedProduct.barcode || '-'}</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-sm text-slate-500">CBM</div>
                  <div className="font-semibold text-slate-800">{selectedProduct.cbm || '-'}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-500">무게 (kg)</div>
                  <div className="font-semibold text-slate-800">{selectedProduct.weight_kg || '-'}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-500">파렛트당 수량</div>
                  <div className="font-semibold text-slate-800">{selectedProduct.pallet_qty || '-'}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <div className="text-sm text-slate-500">단가 (RMB)</div>
                  <div className="font-semibold text-orange-600">
                    {selectedProduct.unit_price_rmb ? `¥${selectedProduct.unit_price_rmb.toLocaleString()}` : '-'}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-slate-500">단가 (USD)</div>
                  <div className="font-semibold text-blue-600">
                    {selectedProduct.unit_price_usd ? `$${selectedProduct.unit_price_usd.toLocaleString()}` : '-'}
                  </div>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setSelectedProductSku(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-medium transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 부자재 정보 팝업 */}
      {selectedSupplySku && selectedSupply && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedSupplySku(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <h2 className="text-lg font-bold text-slate-900">부자재 정보</h2>
              <button onClick={() => setSelectedSupplySku(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <div className="text-sm text-slate-500">부자재명</div>
                <div className="text-lg font-semibold text-slate-900">{selectedSupply.name}</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-slate-500">SKU</div>
                  <div className="font-mono text-slate-800">{selectedSupply.sku}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-500">QR 코드</div>
                  <div className="font-mono text-slate-800">{selectedSupply.qr_code || '-'}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-slate-500">단위</div>
                  <div className="font-semibold text-slate-800">{selectedSupply.unit_name || '-'}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-500">단위당 수량</div>
                  <div className="font-semibold text-slate-800">{selectedSupply.unit_qty || '-'}</div>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setSelectedSupplySku(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-medium transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
