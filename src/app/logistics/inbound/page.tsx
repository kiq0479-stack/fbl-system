'use client';

import { useState, useEffect } from 'react';
import { InboundRequest, InboundStatus, InboundItem, VENDORS } from '@/types/database';

export default function InboundPage() {
  const [inbounds, setInbounds] = useState<InboundRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<InboundStatus | 'all'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    request_number: '',
    vendor_id: VENDORS[0]?.id || '',
    warehouse_name: '천안1 센터',
    expected_date: '',
    total_pallets: 1,
    notes: '',
  });

  // 파레트별 품목 (각 파레트마다 품목 배열)
  const [palletItems, setPalletItems] = useState<Record<number, Partial<InboundItem>[]>>({
    1: [{ pallet_number: 1, sku: '', product_name: '', box_quantity: 0, quantity: 0 }]
  });
  
  // 현재 선택된 파레트 탭
  const [activePallet, setActivePallet] = useState(1);

  // 상세보기/상태변경/수정 모달
  const [selectedInbound, setSelectedInbound] = useState<InboundRequest | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // 알림 표시 여부
  const [showAlert, setShowAlert] = useState(false);
  const [overdueCount, setOverdueCount] = useState(0);

  useEffect(() => {
    fetchInbounds();
  }, []);

  // 도착예정일 경과 체크
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const overdueItems = inbounds.filter(item => {
      if (item.status === 'completed' || item.status === 'cancelled') return false;
      const expectedDate = new Date(item.expected_date);
      expectedDate.setHours(0, 0, 0, 0);
      return expectedDate <= today;
    });
    
    setOverdueCount(overdueItems.length);
    if (overdueItems.length > 0) {
      setShowAlert(true);
    }
  }, [inbounds]);

  // 도착예정일 경과 여부 체크 함수
  const isOverdue = (inbound: InboundRequest) => {
    if (inbound.status === 'completed' || inbound.status === 'cancelled') return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expectedDate = new Date(inbound.expected_date);
    expectedDate.setHours(0, 0, 0, 0);
    return expectedDate <= today;
  };

  const fetchInbounds = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/inbound');
      if (res.ok) {
        const json = await res.json();
        setInbounds(json.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch inbounds:', error);
    } finally {
      setLoading(false);
    }
  };

  // 파레트 수 변경 핸들러
  const handlePalletCountChange = (count: number) => {
    const newCount = Math.max(1, Math.min(20, count)); // 1~20 제한
    setFormData({ ...formData, total_pallets: newCount });
    
    // 새로운 파레트 추가
    const newPalletItems = { ...palletItems };
    for (let i = 1; i <= newCount; i++) {
      if (!newPalletItems[i]) {
        newPalletItems[i] = [{ pallet_number: i, sku: '', product_name: '', box_quantity: 0, quantity: 0 }];
      }
    }
    // 초과된 파레트 제거
    Object.keys(newPalletItems).forEach(key => {
      if (Number(key) > newCount) {
        delete newPalletItems[Number(key)];
      }
    });
    setPalletItems(newPalletItems);
    
    // 활성 파레트가 범위를 벗어나면 조정
    if (activePallet > newCount) {
      setActivePallet(newCount);
    }
  };

  const handleAddItem = () => {
    const currentItems = palletItems[activePallet] || [];
    setPalletItems({
      ...palletItems,
      [activePallet]: [
        ...currentItems,
        { pallet_number: activePallet, sku: '', product_name: '', box_quantity: 0, quantity: 0 }
      ]
    });
  };

  const handleRemoveItem = (index: number) => {
    const currentItems = palletItems[activePallet] || [];
    if (currentItems.length > 1) {
      setPalletItems({
        ...palletItems,
        [activePallet]: currentItems.filter((_, i) => i !== index)
      });
    }
  };

  const handleItemChange = (index: number, field: keyof InboundItem, value: any) => {
    const currentItems = [...(palletItems[activePallet] || [])];
    currentItems[index] = { ...currentItems[index], [field]: value };
    setPalletItems({
      ...palletItems,
      [activePallet]: currentItems
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    // 모든 파레트의 품목을 합침
    const allItems: Partial<InboundItem>[] = [];
    Object.values(palletItems).forEach(items => {
      allItems.push(...items);
    });

    // Calculate totals
    const total_pallets = formData.total_pallets;
    const total_boxes = allItems.reduce((sum, item) => sum + (Number(item.box_quantity) || 0), 0);
    const total_quantity = allItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

    // 업체명 가져오기
    const vendor = VENDORS.find(v => v.id === formData.vendor_id);

    const payload = {
      ...formData,
      vendor_name: vendor?.name || '',
      status: 'pending',
      total_pallets,
      total_boxes,
      total_quantity,
      items: allItems
    };

    try {
      const res = await fetch('/api/inbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsModalOpen(false);
        // Reset form
        setFormData({
          request_number: '',
          vendor_id: VENDORS[0]?.id || '',
          warehouse_name: '천안1 센터',
          expected_date: '',
          total_pallets: 1,
          notes: '',
        });
        setPalletItems({
          1: [{ pallet_number: 1, sku: '', product_name: '', box_quantity: 0, quantity: 0 }]
        });
        setActivePallet(1);
        fetchInbounds();
      } else {
        alert('입고 등록에 실패했습니다.');
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      alert('오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredInbounds = activeFilter === 'all' 
    ? inbounds 
    : inbounds.filter(item => item.status === activeFilter);

  // 적재리스트 출력 (docx 다운로드)
  const handleDownloadDocx = async (inbound: InboundRequest) => {
    try {
      const res = await fetch(`/api/inbound/${inbound.id}/docx`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `적재리스트_${inbound.request_number}.docx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } else {
        alert('다운로드 실패');
      }
    } catch (error) {
      console.error('Download error:', error);
      alert('다운로드 중 오류 발생');
    }
  };

  // 상태 변경
  const handleStatusChange = async (newStatus: InboundStatus) => {
    if (!selectedInbound) return;
    try {
      const res = await fetch(`/api/inbound/${selectedInbound.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setIsStatusModalOpen(false);
        setSelectedInbound(null);
        fetchInbounds();
      } else {
        alert('상태 변경 실패');
      }
    } catch (error) {
      console.error('Status change error:', error);
      alert('상태 변경 중 오류 발생');
    }
  };

  // 삭제
  const handleDelete = async (inbound: InboundRequest) => {
    if (!confirm(`입고요청 "${inbound.request_number}"을(를) 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/inbound/${inbound.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchInbounds();
      } else {
        alert('삭제 실패');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('삭제 중 오류 발생');
    }
  };

  // 수정 모달 열기 - 데이터 로드
  const handleOpenEdit = (inbound: InboundRequest) => {
    setSelectedInbound(inbound);
    setFormData({
      request_number: inbound.request_number,
      vendor_id: inbound.vendor_id || VENDORS[0]?.id || '',
      warehouse_name: inbound.warehouse_name,
      expected_date: inbound.expected_date,
      total_pallets: inbound.total_pallets || 1,
      notes: inbound.notes || '',
    });
    
    // 품목 데이터 로드
    if (inbound.items && inbound.items.length > 0) {
      const newPalletItems: Record<number, Partial<InboundItem>[]> = {};
      inbound.items.forEach(item => {
        const palletNum = item.pallet_number || 1;
        if (!newPalletItems[palletNum]) {
          newPalletItems[palletNum] = [];
        }
        newPalletItems[palletNum].push({
          pallet_number: palletNum,
          sku: item.sku,
          product_name: item.product_name,
          box_quantity: item.box_quantity,
          quantity: item.quantity,
        });
      });
      setPalletItems(newPalletItems);
    } else {
      setPalletItems({
        1: [{ pallet_number: 1, sku: '', product_name: '', box_quantity: 0, quantity: 0 }]
      });
    }
    setActivePallet(1);
    setIsEditModalOpen(true);
  };

  // 수정 제출
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInbound) return;
    setSubmitting(true);

    const allItems: Partial<InboundItem>[] = [];
    Object.values(palletItems).forEach(items => {
      allItems.push(...items);
    });

    const total_pallets = formData.total_pallets;
    const total_boxes = allItems.reduce((sum, item) => sum + (Number(item.box_quantity) || 0), 0);
    const total_quantity = allItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

    const vendor = VENDORS.find(v => v.id === formData.vendor_id);

    const payload = {
      ...formData,
      vendor_name: vendor?.name || '',
      total_pallets,
      total_boxes,
      total_quantity,
      items: allItems
    };

    try {
      const res = await fetch(`/api/inbound/${selectedInbound.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsEditModalOpen(false);
        setSelectedInbound(null);
        // Reset form
        setFormData({
          request_number: '',
          vendor_id: VENDORS[0]?.id || '',
          warehouse_name: '천안1 센터',
          expected_date: '',
          total_pallets: 1,
          notes: '',
        });
        setPalletItems({
          1: [{ pallet_number: 1, sku: '', product_name: '', box_quantity: 0, quantity: 0 }]
        });
        setActivePallet(1);
        fetchInbounds();
      } else {
        alert('수정에 실패했습니다.');
      }
    } catch (error) {
      console.error('Error updating:', error);
      alert('오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: InboundStatus) => {
    switch (status) {
      case 'pending':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">대기중</span>;
      case 'in_transit':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">입고중</span>;
      case 'completed':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">입고완료</span>;
      case 'cancelled':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">취소됨</span>;
      default:
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* 도착예정일 경과 알림 배너 */}
      {showAlert && overdueCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-amber-800">입고 확인 필요!</p>
              <p className="text-sm text-amber-600">{overdueCount}건의 입고가 도착예정일이 경과했습니다. 입고완료 처리해주세요.</p>
            </div>
          </div>
          <button onClick={() => setShowAlert(false)} className="text-amber-400 hover:text-amber-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">입고 관리</h1>
          <p className="text-sm text-slate-500 mt-1">물류센터 입고 예정 및 현황을 관리합니다.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
        >
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          입고 등록
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveFilter('all')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeFilter === 'all' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            전체
            {overdueCount > 0 && (
              <span className="bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded-full animate-pulse">{overdueCount}</span>
            )}
          </button>
          <button
            onClick={() => setActiveFilter('pending')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeFilter === 'pending' ? 'border-yellow-500 text-yellow-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            대기중
            {inbounds.filter(i => i.status === 'pending' && isOverdue(i)).length > 0 && (
              <span className="bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded-full animate-pulse">
                {inbounds.filter(i => i.status === 'pending' && isOverdue(i)).length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveFilter('in_transit')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeFilter === 'in_transit' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            입고중
            {inbounds.filter(i => i.status === 'in_transit' && isOverdue(i)).length > 0 && (
              <span className="bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded-full animate-pulse">
                {inbounds.filter(i => i.status === 'in_transit' && isOverdue(i)).length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveFilter('completed')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeFilter === 'completed' ? 'border-green-500 text-green-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            입고완료
          </button>
        </nav>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-slate-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">업체</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">입고요청번호</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">납품센터</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">도착예정일</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">팔레트</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">박스</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">총수량</th>
                <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">상태</th>
                <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">관리</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex justify-center items-center">
                      <svg className="animate-spin h-5 w-5 text-blue-500 mr-2" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      로딩중...
                    </div>
                  </td>
                </tr>
              ) : filteredInbounds.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-slate-500">
                    데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                filteredInbounds.map((inbound) => (
                  <tr 
                    key={inbound.id} 
                    className={`transition-colors ${
                      isOverdue(inbound) 
                        ? 'bg-amber-50 hover:bg-amber-100 border-l-4 border-l-amber-400' 
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {isOverdue(inbound) && (
                        <span className="inline-block w-2 h-2 bg-amber-500 rounded-full mr-2 animate-pulse" title="입고 확인 필요"></span>
                      )}
                      {inbound.vendor_name || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{inbound.request_number}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{inbound.warehouse_name}</td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${isOverdue(inbound) ? 'text-amber-700 font-medium' : 'text-slate-500'}`}>
                      {inbound.expected_date}
                      {isOverdue(inbound) && <span className="ml-1 text-xs text-amber-600">(경과)</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-slate-900">{inbound.total_pallets?.toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-slate-900">{inbound.total_boxes?.toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-slate-900 font-medium">{inbound.total_quantity?.toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {getStatusBadge(inbound.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-center space-x-2">
                      <button 
                        onClick={() => { setSelectedInbound(inbound); setIsDetailOpen(true); }}
                        className="text-blue-600 hover:text-blue-900"
                      >상세</button>
                      <button 
                        onClick={() => handleDownloadDocx(inbound)}
                        className="text-slate-600 hover:text-slate-900"
                      >출력</button>
                      <button 
                        onClick={() => { setSelectedInbound(inbound); setIsStatusModalOpen(true); }}
                        className="text-green-600 hover:text-green-900"
                      >상태변경</button>
                      <button 
                        onClick={() => handleOpenEdit(inbound)}
                        className="text-orange-600 hover:text-orange-900"
                      >수정</button>
                      <button 
                        onClick={() => handleDelete(inbound)}
                        className="text-red-600 hover:text-red-900"
                      >삭제</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 상세보기 모달 */}
      {isDetailOpen && selectedInbound && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center sticky top-0 bg-white">
              <h2 className="text-lg font-bold text-slate-900">입고 상세</h2>
              <button onClick={() => { setIsDetailOpen(false); setSelectedInbound(null); }} className="text-slate-400 hover:text-slate-500">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div><span className="text-slate-500">업체:</span> <span className="font-medium">{selectedInbound.vendor_name || '-'}</span></div>
                <div><span className="text-slate-500">입고요청번호:</span> <span className="font-medium">{selectedInbound.request_number}</span></div>
                <div><span className="text-slate-500">납품센터:</span> <span className="font-medium">{selectedInbound.warehouse_name}</span></div>
                <div><span className="text-slate-500">도착예정일:</span> <span className="font-medium">{selectedInbound.expected_date}</span></div>
                <div><span className="text-slate-500">상태:</span> {getStatusBadge(selectedInbound.status)}</div>
                <div><span className="text-slate-500">메모:</span> <span className="font-medium">{selectedInbound.notes || '-'}</span></div>
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div><div className="text-2xl font-bold text-slate-900">{selectedInbound.total_pallets}</div><div className="text-sm text-slate-500">파레트</div></div>
                  <div><div className="text-2xl font-bold text-slate-900">{selectedInbound.total_boxes}</div><div className="text-sm text-slate-500">박스</div></div>
                  <div><div className="text-2xl font-bold text-slate-900">{selectedInbound.total_quantity}</div><div className="text-sm text-slate-500">총수량</div></div>
                </div>
              </div>
              {selectedInbound.items && selectedInbound.items.length > 0 && (
                <div>
                  <h3 className="text-md font-semibold text-slate-900 mb-3">품목 목록</h3>
                  <table className="min-w-full divide-y divide-slate-200 border border-slate-200 rounded-lg">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">파레트</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">SKU</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">상품명</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-slate-500">박스</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-slate-500">수량</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                      {selectedInbound.items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-2 text-sm">P{item.pallet_number}</td>
                          <td className="px-4 py-2 text-sm">{item.sku}</td>
                          <td className="px-4 py-2 text-sm">{item.product_name}</td>
                          <td className="px-4 py-2 text-sm text-right">{item.box_quantity}</td>
                          <td className="px-4 py-2 text-sm text-right">{item.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={() => handleDownloadDocx(selectedInbound)} className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white text-sm font-medium rounded-lg">
                적재리스트 출력
              </button>
              <button onClick={() => { setIsDetailOpen(false); setSelectedInbound(null); }} className="px-4 py-2 border border-slate-300 text-sm font-medium rounded-lg text-slate-700 bg-white hover:bg-slate-50">
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 상태변경 모달 */}
      {isStatusModalOpen && selectedInbound && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">상태 변경</h2>
              <p className="text-sm text-slate-500 mt-1">입고요청번호: {selectedInbound.request_number}</p>
            </div>
            <div className="p-6 space-y-3">
              <button onClick={() => handleStatusChange('pending')} className={`w-full px-4 py-3 rounded-lg text-left ${selectedInbound.status === 'pending' ? 'bg-yellow-100 border-2 border-yellow-400' : 'bg-slate-50 hover:bg-slate-100'}`}>
                <span className="font-medium">대기중</span>
                <span className="text-sm text-slate-500 ml-2">입고 대기 상태</span>
              </button>
              <button onClick={() => handleStatusChange('in_transit')} className={`w-full px-4 py-3 rounded-lg text-left ${selectedInbound.status === 'in_transit' ? 'bg-blue-100 border-2 border-blue-400' : 'bg-slate-50 hover:bg-slate-100'}`}>
                <span className="font-medium">입고중</span>
                <span className="text-sm text-slate-500 ml-2">물류센터 이동중</span>
              </button>
              <button onClick={() => handleStatusChange('completed')} className={`w-full px-4 py-3 rounded-lg text-left ${selectedInbound.status === 'completed' ? 'bg-green-100 border-2 border-green-400' : 'bg-slate-50 hover:bg-slate-100'}`}>
                <span className="font-medium">입고완료</span>
                <span className="text-sm text-slate-500 ml-2">물류센터 도착 완료</span>
              </button>
              <button onClick={() => handleStatusChange('cancelled')} className={`w-full px-4 py-3 rounded-lg text-left ${selectedInbound.status === 'cancelled' ? 'bg-red-100 border-2 border-red-400' : 'bg-slate-50 hover:bg-slate-100'}`}>
                <span className="font-medium text-red-600">취소됨</span>
                <span className="text-sm text-slate-500 ml-2">입고 취소</span>
              </button>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end">
              <button onClick={() => { setIsStatusModalOpen(false); setSelectedInbound(null); }} className="px-4 py-2 border border-slate-300 text-sm font-medium rounded-lg text-slate-700 bg-white hover:bg-slate-50">
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 입고등록 Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold text-slate-900">입고 등록</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-500">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* 기본 정보 */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">업체 <span className="text-red-500">*</span></label>
                  <select
                    value={formData.vendor_id}
                    onChange={(e) => setFormData({...formData, vendor_id: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {VENDORS.map(vendor => (
                      <option key={vendor.id} value={vendor.id}>
                        {vendor.name} ({vendor.platform})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">입고요청서번호 <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={formData.request_number}
                    onChange={(e) => setFormData({...formData, request_number: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="121397144"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">납품센터 <span className="text-red-500">*</span></label>
                  <select
                    value={formData.warehouse_name}
                    onChange={(e) => setFormData({...formData, warehouse_name: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="천안1 센터">천안1 센터</option>
                    <option value="대전 센터">대전 센터</option>
                    <option value="용인 센터">용인 센터</option>
                    <option value="기타">기타</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">도착예정일 <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    required
                    value={formData.expected_date}
                    onChange={(e) => setFormData({...formData, expected_date: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">총 파레트 수 <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={formData.total_pallets}
                    onChange={(e) => handlePalletCountChange(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">메모</label>
                  <input
                    type="text"
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="특이사항"
                  />
                </div>
              </div>

              {/* 파레트별 탭 */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-md font-semibold text-slate-900">파레트별 품목 정보</h3>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    품목 추가
                  </button>
                </div>

                {/* 파레트 탭 */}
                <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-2">
                  {Array.from({ length: formData.total_pallets }, (_, i) => i + 1).map(palletNum => {
                    const items = palletItems[palletNum] || [];
                    const itemCount = items.length;
                    const hasItems = items.some(item => (item.sku && item.sku.length > 0) || (item.product_name && item.product_name.length > 0));
                    return (
                      <button
                        key={palletNum}
                        type="button"
                        onClick={() => setActivePallet(palletNum)}
                        className={`px-3 py-1.5 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-1 ${
                          activePallet === palletNum
                            ? 'bg-blue-600 text-white'
                            : hasItems
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        P{palletNum}
                        {hasItems && <span className="text-xs">({itemCount})</span>}
                      </button>
                    );
                  })}
                </div>

                {/* 현재 파레트 품목 테이블 */}
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <div className="bg-blue-50 px-4 py-2 border-b border-slate-200">
                    <span className="text-sm font-medium text-blue-800">파레트 {activePallet}</span>
                  </div>
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 w-16">No.</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 w-32">SKU</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">상품명</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 w-24">박스수</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 w-24">수량</th>
                        <th className="px-4 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                      {(palletItems[activePallet] || []).map((item, index) => (
                        <tr key={index}>
                          <td className="px-4 py-2 text-sm text-slate-500">{index + 1}</td>
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              value={item.sku || ''}
                              onChange={(e) => handleItemChange(index, 'sku', e.target.value)}
                              className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                              placeholder="58911087"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              value={item.product_name || ''}
                              onChange={(e) => handleItemChange(index, 'product_name', e.target.value)}
                              className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                              placeholder="베이직+책장 4단"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="number"
                              value={item.box_quantity || 0}
                              onChange={(e) => handleItemChange(index, 'box_quantity', parseInt(e.target.value) || 0)}
                              className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="number"
                              value={item.quantity || 0}
                              onChange={(e) => handleItemChange(index, 'quantity', parseInt(e.target.value) || 0)}
                              className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                            />
                          </td>
                          <td className="px-4 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(index)}
                              className="text-red-400 hover:text-red-600 disabled:opacity-30"
                              disabled={(palletItems[activePallet] || []).length === 1}
                            >
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 전체 요약 */}
                <div className="bg-slate-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-slate-700 mb-2">전체 요약</h4>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-slate-500">총 파레트:</span>
                      <span className="ml-2 font-medium">{formData.total_pallets}개</span>
                    </div>
                    <div>
                      <span className="text-slate-500">총 박스:</span>
                      <span className="ml-2 font-medium">
                        {Object.values(palletItems).flat().reduce((sum, item) => sum + (Number(item.box_quantity) || 0), 0)}개
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">총 수량:</span>
                      <span className="ml-2 font-medium">
                        {Object.values(palletItems).flat().reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)}개
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 shadow-sm text-sm font-medium rounded-lg text-slate-700 bg-white hover:bg-slate-50 focus:outline-none"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none disabled:bg-blue-400"
                >
                  {submitting ? '등록 중...' : '등록하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 수정 모달 */}
      {isEditModalOpen && selectedInbound && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold text-slate-900">입고 수정</h2>
              <button onClick={() => { setIsEditModalOpen(false); setSelectedInbound(null); }} className="text-slate-400 hover:text-slate-500">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <form onSubmit={handleEditSubmit} className="p-6 space-y-6">
              {/* 기본 정보 */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">업체 <span className="text-red-500">*</span></label>
                  <select
                    value={formData.vendor_id}
                    onChange={(e) => setFormData({...formData, vendor_id: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {VENDORS.map(vendor => (
                      <option key={vendor.id} value={vendor.id}>
                        {vendor.name} ({vendor.platform})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">입고요청서번호 <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={formData.request_number}
                    onChange={(e) => setFormData({...formData, request_number: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="121397144"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">납품센터 <span className="text-red-500">*</span></label>
                  <select
                    value={formData.warehouse_name}
                    onChange={(e) => setFormData({...formData, warehouse_name: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="천안1 센터">천안1 센터</option>
                    <option value="대전 센터">대전 센터</option>
                    <option value="용인 센터">용인 센터</option>
                    <option value="기타">기타</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">도착예정일 <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    required
                    value={formData.expected_date}
                    onChange={(e) => setFormData({...formData, expected_date: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">총 파레트 수 <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={formData.total_pallets}
                    onChange={(e) => handlePalletCountChange(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">메모</label>
                  <input
                    type="text"
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="특이사항"
                  />
                </div>
              </div>

              {/* 파레트별 탭 */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-md font-semibold text-slate-900">파레트별 품목 정보</h3>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    품목 추가
                  </button>
                </div>

                {/* 파레트 탭 */}
                <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-2">
                  {Array.from({ length: formData.total_pallets }, (_, i) => i + 1).map(palletNum => {
                    const items = palletItems[palletNum] || [];
                    const itemCount = items.length;
                    const hasItems = items.some(item => (item.sku && item.sku.length > 0) || (item.product_name && item.product_name.length > 0));
                    return (
                      <button
                        key={palletNum}
                        type="button"
                        onClick={() => setActivePallet(palletNum)}
                        className={`px-3 py-1.5 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-1 ${
                          activePallet === palletNum
                            ? 'bg-orange-600 text-white'
                            : hasItems
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        P{palletNum}
                        {hasItems && <span className="text-xs">({itemCount})</span>}
                      </button>
                    );
                  })}
                </div>

                {/* 현재 파레트 품목 테이블 */}
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <div className="bg-orange-50 px-4 py-2 border-b border-slate-200">
                    <span className="text-sm font-medium text-orange-800">파레트 {activePallet}</span>
                  </div>
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 w-16">No.</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 w-32">SKU</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">상품명</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 w-24">박스수</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 w-24">수량</th>
                        <th className="px-4 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                      {(palletItems[activePallet] || []).map((item, index) => (
                        <tr key={index}>
                          <td className="px-4 py-2 text-sm text-slate-500">{index + 1}</td>
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              value={item.sku || ''}
                              onChange={(e) => handleItemChange(index, 'sku', e.target.value)}
                              className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                              placeholder="58911087"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              value={item.product_name || ''}
                              onChange={(e) => handleItemChange(index, 'product_name', e.target.value)}
                              className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                              placeholder="베이직+책장 4단"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="number"
                              value={item.box_quantity || 0}
                              onChange={(e) => handleItemChange(index, 'box_quantity', parseInt(e.target.value) || 0)}
                              className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="number"
                              value={item.quantity || 0}
                              onChange={(e) => handleItemChange(index, 'quantity', parseInt(e.target.value) || 0)}
                              className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                            />
                          </td>
                          <td className="px-4 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(index)}
                              className="text-red-400 hover:text-red-600 disabled:opacity-30"
                              disabled={(palletItems[activePallet] || []).length === 1}
                            >
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 전체 요약 */}
                <div className="bg-slate-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-slate-700 mb-2">전체 요약</h4>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-slate-500">총 파레트:</span>
                      <span className="ml-2 font-medium">{formData.total_pallets}개</span>
                    </div>
                    <div>
                      <span className="text-slate-500">총 박스:</span>
                      <span className="ml-2 font-medium">
                        {Object.values(palletItems).flat().reduce((sum, item) => sum + (Number(item.box_quantity) || 0), 0)}개
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">총 수량:</span>
                      <span className="ml-2 font-medium">
                        {Object.values(palletItems).flat().reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)}개
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => { setIsEditModalOpen(false); setSelectedInbound(null); }}
                  className="px-4 py-2 border border-slate-300 shadow-sm text-sm font-medium rounded-lg text-slate-700 bg-white hover:bg-slate-50 focus:outline-none"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-orange-600 hover:bg-orange-700 focus:outline-none disabled:bg-orange-400"
                >
                  {submitting ? '수정 중...' : '수정하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
