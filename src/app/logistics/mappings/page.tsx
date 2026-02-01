'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Marketplace } from '@/types/database';

interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
}

interface ProductMapping {
  id: string;
  product_id: string;
  marketplace: Marketplace;
  external_product_id: string | null;
  external_product_name: string | null;
  external_option_id: string | null;
  external_option_name: string | null;
  is_active: boolean;
  created_at: string;
  products?: Product;
}

// 네이버 상품 정보 (상품명 + originProductNo)
interface NaverProduct {
  originProductNo: number;
  productName: string;
  channelProductNo?: number;
  salePrice?: number;
  stockQuantity?: number;
}

type TabType = 'all' | 'naver' | 'selfmall';
type MappingMarketplace = 'naver' | 'selfmall';

export default function MappingsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('naver');
  const [mappings, setMappings] = useState<ProductMapping[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [naverProducts, setNaverProducts] = useState<NaverProduct[]>([]);  // 전체 네이버 상품 목록
  const [naverProductNames, setNaverProductNames] = useState<string[]>([]);  // 상품명만 (중복 제거)
  const [naverOptionNames, setNaverOptionNames] = useState<string[]>([]);  // 선택된 상품의 옵션명 목록
  const [loading, setLoading] = useState(true);
  const [loadingNaverProducts, setLoadingNaverProducts] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);  // 옵션 로딩 상태
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMapping, setEditingMapping] = useState<ProductMapping | null>(null);
  const [editOptionNames, setEditOptionNames] = useState<string[]>([]);  // 수정 모달용 옵션 목록
  const [loadingEditOptions, setLoadingEditOptions] = useState(false);  // 수정 모달 옵션 로딩
  
  // 새 매핑 폼
  const [newMapping, setNewMapping] = useState({
    product_id: '',
    marketplace: 'naver' as MappingMarketplace,
    external_product_name: '',
    external_option_name: '',  // 옵션명 추가
  });

  // 매핑 목록 조회
  const fetchMappings = useCallback(async () => {
    setLoading(true);
    try {
      const marketplace = activeTab === 'all' ? '' : activeTab;
      const res = await fetch(`/api/mappings?marketplace=${marketplace}&include_products=true`);
      const data = await res.json();
      setMappings(data.mappings || []);
    } catch (error) {
      console.error('매핑 조회 실패:', error);
    }
    setLoading(false);
  }, [activeTab]);

  // 쿠팡 상품 목록 조회
  const fetchProducts = async () => {
    try {
      const supabaseRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/products?select=id,name,sku,barcode&is_active=eq.true&order=name`, {
        headers: {
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
        }
      });
      if (supabaseRes.ok) {
        const productsData = await supabaseRes.json();
        setProducts(productsData || []);
      }
    } catch (error) {
      console.error('상품 조회 실패:', error);
    }
  };

  // 네이버 판매중인 상품 목록 조회
  const fetchNaverProductNames = async () => {
    setLoadingNaverProducts(true);
    try {
      const res = await fetch('/api/naver/products');
      if (res.ok) {
        const data = await res.json();
        // 전체 상품 데이터 저장
        setNaverProducts(data.data || []);
        // 판매중인 상품명 목록 (중복 제거)
        const productNames = data.productNames || [];
        setNaverProductNames(productNames);
      }
    } catch (error) {
      console.error('네이버 상품명 조회 실패:', error);
    }
    setLoadingNaverProducts(false);
  };

  // 네이버 상품 옵션 목록 조회
  const fetchNaverOptions = async (productName: string) => {
    // 상품명으로 originProductNo 찾기
    const product = naverProducts.find(p => p.productName === productName);
    if (!product) {
      setNaverOptionNames([]);
      return;
    }

    setLoadingOptions(true);
    try {
      const res = await fetch(`/api/naver/products/${product.originProductNo}`);
      if (res.ok) {
        const data = await res.json();
        setNaverOptionNames(data.data?.optionNames || []);
      } else {
        setNaverOptionNames([]);
      }
    } catch (error) {
      console.error('네이버 옵션 조회 실패:', error);
      setNaverOptionNames([]);
    }
    setLoadingOptions(false);
  };

  // 수정 모달용 옵션 조회
  const fetchEditOptions = async (productName: string) => {
    // 상품명으로 originProductNo 찾기
    const product = naverProducts.find(p => p.productName === productName);
    if (!product) {
      setEditOptionNames([]);
      return;
    }

    setLoadingEditOptions(true);
    try {
      const res = await fetch(`/api/naver/products/${product.originProductNo}`);
      if (res.ok) {
        const data = await res.json();
        setEditOptionNames(data.data?.optionNames || []);
      } else {
        setEditOptionNames([]);
      }
    } catch (error) {
      console.error('네이버 옵션 조회 실패:', error);
      setEditOptionNames([]);
    }
    setLoadingEditOptions(false);
  };

  useEffect(() => {
    fetchMappings();
    fetchProducts();
  }, [fetchMappings]);

  // 모달 열릴 때 네이버 상품명 로드
  useEffect(() => {
    if (showAddModal && newMapping.marketplace === 'naver' && naverProductNames.length === 0) {
      fetchNaverProductNames();
    }
  }, [showAddModal, newMapping.marketplace, naverProductNames.length]);

  // 수정 모달 열릴 때도 네이버 상품명 로드
  useEffect(() => {
    if (editingMapping && editingMapping.marketplace === 'naver' && naverProductNames.length === 0) {
      fetchNaverProductNames();
    }
  }, [editingMapping, naverProductNames.length]);

  // 수정 모달에서 상품이 선택되어 있으면 옵션 로드
  useEffect(() => {
    if (editingMapping && editingMapping.marketplace === 'naver' && editingMapping.external_product_name && naverProducts.length > 0) {
      fetchEditOptions(editingMapping.external_product_name);
    }
  }, [editingMapping?.external_product_name, naverProducts.length]);

  // 매핑 추가
  const handleAddMapping = async () => {
    if (!newMapping.product_id || !newMapping.marketplace || !newMapping.external_product_name) {
      alert('모든 항목을 선택해주세요.');
      return;
    }

    try {
      const res = await fetch('/api/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: newMapping.product_id,
          marketplace: newMapping.marketplace,
          external_product_name: newMapping.external_product_name,
          external_product_id: null,
          external_option_id: null,
          external_option_name: newMapping.external_option_name || null,  // 옵션명 전송
        }),
      });

      if (res.ok) {
        setShowAddModal(false);
        setNewMapping({
          product_id: '',
          marketplace: 'naver',
          external_product_name: '',
          external_option_name: '',
        });
        setNaverOptionNames([]);  // 옵션 목록 초기화
        fetchMappings();
      } else {
        const data = await res.json();
        alert(data.error || '매핑 추가 실패');
      }
    } catch (error) {
      console.error('매핑 추가 실패:', error);
      alert('매핑 추가 중 오류가 발생했습니다.');
    }
  };

  // 매핑 수정
  const handleUpdateMapping = async () => {
    if (!editingMapping) return;

    try {
      const res = await fetch('/api/mappings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingMapping),
      });

      if (res.ok) {
        setEditingMapping(null);
        setEditOptionNames([]);  // 옵션 목록 초기화
        fetchMappings();
      } else {
        const data = await res.json();
        alert(data.error || '매핑 수정 실패');
      }
    } catch (error) {
      console.error('매핑 수정 실패:', error);
    }
  };

  // 매핑 삭제
  const handleDeleteMapping = async (id: string) => {
    if (!confirm('이 매핑을 삭제하시겠습니까?')) return;

    try {
      const res = await fetch(`/api/mappings?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchMappings();
      }
    } catch (error) {
      console.error('매핑 삭제 실패:', error);
    }
  };

  const getMarketplaceBadge = (marketplace: string) => {
    const styles: Record<string, string> = {
      naver: 'bg-green-100 text-green-800',
      selfmall: 'bg-purple-100 text-purple-800',
      coupang: 'bg-red-100 text-red-800',
      auction: 'bg-orange-100 text-orange-800',
      gmarket: 'bg-blue-100 text-blue-800',
    };
    const labels: Record<string, string> = {
      naver: '네이버',
      selfmall: '자사몰',
      coupang: '쿠팡',
      auction: '옥션',
      gmarket: 'G마켓',
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[marketplace] || 'bg-gray-100 text-gray-800'}`}>
        {labels[marketplace] || marketplace}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">상품 매핑</h1>
          <p className="text-sm text-slate-500 mt-1">
            내부 상품과 마켓플레이스 상품을 연결하여 재고를 자동 동기화합니다.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
        >
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          매핑 추가
        </button>
      </div>

      {/* 탭 */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-4">
          {[
            { key: 'naver', label: '네이버' },
            { key: 'selfmall', label: '자사몰' },
            { key: 'all', label: '전체' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as TabType)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* 매핑 테이블 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">
            <svg className="animate-spin h-8 w-8 mx-auto mb-4 text-blue-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            매핑 정보를 불러오는 중...
          </div>
        ) : mappings.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <svg className="w-12 h-12 mx-auto mb-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <p className="font-medium">등록된 매핑이 없습니다</p>
            <p className="text-sm mt-1">상품 매핑을 추가하여 재고 동기화를 시작하세요.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap w-20">마켓</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap min-w-[200px]">쿠팡 상품</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap min-w-[250px]">외부 상품명</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap min-w-[100px]">옵션명</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase whitespace-nowrap w-24">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mappings.map((mapping) => (
                  <tr key={mapping.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {getMarketplaceBadge(mapping.marketplace)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">
                        {mapping.products?.name || '-'}
                      </div>
                      <div className="text-xs text-slate-500">
                        옵션ID: {mapping.products?.sku || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-slate-700">
                        {mapping.external_product_name || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm text-slate-600">
                        {mapping.external_option_name || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setEditingMapping(mapping)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteMapping(mapping.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 매핑 추가 모달 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">매핑 추가</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">마켓플레이스</label>
                <select
                  value={newMapping.marketplace}
                  onChange={(e) => {
                    const marketplace = e.target.value as MappingMarketplace;
                    setNewMapping({ ...newMapping, marketplace, external_product_name: '' });
                    if (marketplace === 'naver' && naverProductNames.length === 0) {
                      fetchNaverProductNames();
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="naver">네이버</option>
                  <option value="selfmall">자사몰</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">쿠팡 상품</label>
                <select
                  value={newMapping.product_id}
                  onChange={(e) => setNewMapping({ ...newMapping, product_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">선택하세요</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {newMapping.marketplace === 'naver' ? '네이버 상품명' : '자사몰 상품명'}
                </label>
                {newMapping.marketplace === 'naver' ? (
                  <div className="relative">
                    <select
                      value={newMapping.external_product_name}
                      onChange={(e) => {
                        const selectedName = e.target.value;
                        setNewMapping({ ...newMapping, external_product_name: selectedName, external_option_name: '' });
                        // 상품 선택 시 해당 상품의 옵션 목록 조회
                        if (selectedName) {
                          fetchNaverOptions(selectedName);
                        } else {
                          setNaverOptionNames([]);
                        }
                      }}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={loadingNaverProducts}
                    >
                      <option value="">
                        {loadingNaverProducts ? '네이버 상품 로딩중...' : '선택하세요'}
                      </option>
                      {naverProductNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                    {loadingNaverProducts && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <svg className="animate-spin h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      </div>
                    )}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={newMapping.external_product_name}
                    onChange={(e) => setNewMapping({ ...newMapping, external_product_name: e.target.value })}
                    placeholder="자사몰에 표시되는 상품명 입력"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
                {newMapping.marketplace === 'naver' && naverProductNames.length > 0 && (
                  <p className="text-xs text-slate-500 mt-1">
                    네이버 판매중인 상품 {naverProductNames.length}개를 불러왔습니다.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  옵션명 <span className="text-slate-400 font-normal">(선택)</span>
                </label>
                {newMapping.marketplace === 'naver' && newMapping.external_product_name ? (
                  <div className="relative">
                    <select
                      value={newMapping.external_option_name}
                      onChange={(e) => setNewMapping({ ...newMapping, external_option_name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={loadingOptions}
                    >
                      <option value="">
                        {loadingOptions ? '옵션 로딩중...' : naverOptionNames.length === 0 ? '옵션 없음' : '선택하세요 (옵션 없으면 선택 안 함)'}
                      </option>
                      {naverOptionNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                    {loadingOptions && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <svg className="animate-spin h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      </div>
                    )}
                    {!loadingOptions && naverOptionNames.length > 0 && (
                      <p className="text-xs text-slate-500 mt-1">
                        {naverOptionNames.length}개의 옵션을 불러왔습니다.
                      </p>
                    )}
                    {!loadingOptions && naverOptionNames.length === 0 && newMapping.external_product_name && (
                      <p className="text-xs text-slate-500 mt-1">
                        이 상품은 옵션이 없습니다.
                      </p>
                    )}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={newMapping.external_option_name}
                    onChange={(e) => setNewMapping({ ...newMapping, external_option_name: e.target.value })}
                    placeholder={newMapping.marketplace === 'naver' ? '상품을 먼저 선택하세요' : '예: 베이지그린, L사이즈'}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={newMapping.marketplace === 'naver' && !newMapping.external_product_name}
                  />
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
              >
                취소
              </button>
              <button
                onClick={handleAddMapping}
                disabled={loadingNaverProducts}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
              >
                추가
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 매핑 수정 모달 */}
      {editingMapping && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">매핑 수정</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">마켓플레이스</label>
                <div className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-600">
                  {editingMapping.marketplace === 'naver' ? '네이버' : editingMapping.marketplace === 'selfmall' ? '자사몰' : editingMapping.marketplace}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">쿠팡 상품</label>
                <div className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-600">
                  {editingMapping.products?.name || '-'}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">외부 상품명</label>
                {editingMapping.marketplace === 'naver' ? (
                  <select
                    value={editingMapping.external_product_name || ''}
                    onChange={(e) => {
                      const selectedName = e.target.value;
                      setEditingMapping({ ...editingMapping, external_product_name: selectedName, external_option_name: '' });
                      // 상품 선택 시 해당 상품의 옵션 목록 조회
                      if (selectedName) {
                        fetchEditOptions(selectedName);
                      } else {
                        setEditOptionNames([]);
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">선택하세요</option>
                    {/* 현재 값이 목록에 없을 수 있으므로 추가 */}
                    {editingMapping.external_product_name && !naverProductNames.includes(editingMapping.external_product_name) && (
                      <option value={editingMapping.external_product_name}>
                        {editingMapping.external_product_name}
                      </option>
                    )}
                    {naverProductNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={editingMapping.external_product_name || ''}
                    onChange={(e) => setEditingMapping({ ...editingMapping, external_product_name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  옵션명 <span className="text-slate-400 font-normal">(선택)</span>
                </label>
                {editingMapping.marketplace === 'naver' && editingMapping.external_product_name ? (
                  <div className="relative">
                    <select
                      value={editingMapping.external_option_name || ''}
                      onChange={(e) => setEditingMapping({ ...editingMapping, external_option_name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={loadingEditOptions}
                    >
                      <option value="">
                        {loadingEditOptions ? '옵션 로딩중...' : editOptionNames.length === 0 ? '옵션 없음' : '선택하세요 (옵션 없으면 선택 안 함)'}
                      </option>
                      {/* 현재 값이 목록에 없을 수 있으므로 추가 */}
                      {editingMapping.external_option_name && !editOptionNames.includes(editingMapping.external_option_name) && (
                        <option value={editingMapping.external_option_name}>
                          {editingMapping.external_option_name}
                        </option>
                      )}
                      {editOptionNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                    {loadingEditOptions && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <svg className="animate-spin h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      </div>
                    )}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={editingMapping.external_option_name || ''}
                    onChange={(e) => setEditingMapping({ ...editingMapping, external_option_name: e.target.value })}
                    placeholder={editingMapping.marketplace === 'naver' ? '상품을 먼저 선택하세요' : '예: 베이지그린, L사이즈'}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={editingMapping.marketplace === 'naver' && !editingMapping.external_product_name}
                  />
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => setEditingMapping(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
              >
                취소
              </button>
              <button
                onClick={handleUpdateMapping}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
