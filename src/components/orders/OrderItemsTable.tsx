'use client';

import { useState } from 'react';
import { Database } from '@/types/database';

type Product = Database['public']['Tables']['products']['Row'];
type OrderItem = Database['public']['Tables']['order_items']['Row'];

export interface OrderItemWithProduct extends OrderItem {
  product: Product;
}

interface OrderItemsTableProps {
  items: OrderItemWithProduct[];
  isCommercialMode: boolean;
  onCommercialChange: (changes: Record<string, number>) => void;
  commercialValues: Record<string, number>;
  onUpdateItem?: (itemId: string, updates: { pre_qty?: number; unit_price_usd?: number; unit_price_rmb?: number }) => void;
  onDeleteItem?: (itemId: string) => void;
}

export default function OrderItemsTable({ 
  items, 
  isCommercialMode, 
  onCommercialChange, 
  commercialValues,
  onUpdateItem,
  onDeleteItem,
}: OrderItemsTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ pre_qty: number; unit_price_usd: number; unit_price_rmb: number }>({ pre_qty: 0, unit_price_usd: 0, unit_price_rmb: 0 });

  const startEdit = (item: OrderItemWithProduct) => {
    setEditingId(item.id);
    setEditValues({
      pre_qty: item.pre_qty,
      unit_price_usd: item.unit_price_usd || 0,
      unit_price_rmb: item.unit_price_rmb || 0,
    });
  };

  const saveEdit = () => {
    if (editingId && onUpdateItem) {
      onUpdateItem(editingId, editValues);
    }
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };
  
  const handleQtyChange = (itemId: string, val: string) => {
    const num = parseInt(val) || 0;
    onCommercialChange({ ...commercialValues, [itemId]: num });
  };

  const calculateDiff = (pre: number, comm: number | null) => {
    if (comm === null) return 0;
    return comm - pre;
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
            <tr>
              <th className="px-6 py-4">상품 정보</th>
              <th className="px-6 py-4 text-right">PRE 수량</th>
              <th className="px-6 py-4 text-right">COMMERCIAL 수량</th>
              <th className="px-6 py-4 text-right">차이</th>
              <th className="px-6 py-4 text-right">단가 (RMB)</th>
              <th className="px-6 py-4 text-right">단가 (USD)</th>
              <th className="px-6 py-4 text-center w-24">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {items.map((item) => {
              const commQty = commercialValues[item.id] ?? item.commercial_qty ?? item.pre_qty;
              const diff = calculateDiff(item.pre_qty, commQty);
              const isDiff = diff !== 0;
              
              // Only show diff colors if we are in commercial mode OR if commercial_qty is set (meaning it was confirmed previously)
              const showDiffColors = isCommercialMode || item.commercial_qty !== null;

              const isEditing = editingId === item.id;

              return (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900">{item.product.name}</div>
                    <div className="text-xs text-slate-500">{item.product.sku}</div>
                  </td>
                  <td className="px-6 py-4 text-right text-slate-600 font-medium">
                    {isEditing ? (
                      <input
                        type="number"
                        min="0"
                        value={editValues.pre_qty}
                        onChange={(e) => setEditValues({ ...editValues, pre_qty: parseInt(e.target.value) || 0 })}
                        className="w-20 px-2 py-1 text-right border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    ) : (
                      item.pre_qty.toLocaleString()
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {isCommercialMode ? (
                      <input
                        type="number"
                        min="0"
                        value={commQty}
                        onChange={(e) => handleQtyChange(item.id, e.target.value)}
                        className={`w-24 px-2 py-1 text-right border rounded focus:ring-2 focus:ring-blue-500 outline-none transition-all ${
                          isDiff ? 'border-blue-300 bg-blue-50' : 'border-slate-300'
                        }`}
                      />
                    ) : (
                      <span className={`font-medium ${item.commercial_qty !== null ? 'text-slate-900' : 'text-slate-400 italic'}`}>
                        {item.commercial_qty !== null ? item.commercial_qty.toLocaleString() : '-'}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {showDiffColors && isDiff ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                        diff > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {diff > 0 ? '+' : ''}{diff}
                      </span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right text-slate-600">
                    {isEditing ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={editValues.unit_price_rmb}
                        onChange={(e) => setEditValues({ ...editValues, unit_price_rmb: parseFloat(e.target.value) || 0 })}
                        className="w-20 px-2 py-1 text-right border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    ) : (
                      item.unit_price_rmb ? `¥${item.unit_price_rmb.toLocaleString()}` : '-'
                    )}
                  </td>
                  <td className="px-6 py-4 text-right text-slate-600">
                    {isEditing ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={editValues.unit_price_usd}
                        onChange={(e) => setEditValues({ ...editValues, unit_price_usd: parseFloat(e.target.value) || 0 })}
                        className="w-20 px-2 py-1 text-right border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    ) : (
                      item.unit_price_usd ? `$${item.unit_price_usd.toLocaleString()}` : '-'
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {isEditing ? (
                      <div className="flex justify-center gap-1">
                        <button
                          onClick={saveEdit}
                          className="p-1 text-green-600 hover:bg-green-50 rounded"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="p-1 text-slate-400 hover:bg-slate-50 rounded"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-center gap-1">
                        <button
                          onClick={() => startEdit(item)}
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => onDeleteItem?.(item.id)}
                          className="p-1 text-red-400 hover:bg-red-50 rounded"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-slate-50 font-semibold text-slate-800 border-t border-slate-200">
            <tr>
              <td className="px-6 py-4 text-right">총계</td>
              <td className="px-6 py-4 text-right">
                {items.reduce((acc, item) => acc + item.pre_qty, 0).toLocaleString()}
              </td>
              <td className="px-6 py-4 text-right">
                {items.reduce((acc, item) => acc + (commercialValues[item.id] ?? item.commercial_qty ?? 0), 0).toLocaleString()}
              </td>
              <td className="px-6 py-4"></td>
              <td className="px-6 py-4 text-right text-orange-600">
                ¥{items.reduce((acc, item) => {
                  const qty = commercialValues[item.id] ?? item.commercial_qty ?? item.pre_qty;
                  return acc + (qty * (item.unit_price_rmb || 0));
                }, 0).toLocaleString()}
              </td>
              <td className="px-6 py-4 text-right text-blue-600">
                ${items.reduce((acc, item) => {
                  const qty = commercialValues[item.id] ?? item.commercial_qty ?? item.pre_qty;
                  return acc + (qty * (item.unit_price_usd || 0));
                }, 0).toLocaleString()}
              </td>
              <td className="px-6 py-4"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
