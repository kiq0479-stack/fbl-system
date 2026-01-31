'use client';

import { Database } from '@/types/database';
import Barcode from 'react-barcode';

type Product = Database['public']['Tables']['products']['Row'] & { unit_price_rmb?: number | null };

interface ProductTableProps {
  products: Product[];
  onEdit: (product: Product) => void;
  onDelete: (id: string) => void;
  sortOrder: 'asc' | 'desc';
  onSortChange: (order: 'asc' | 'desc') => void;
}

export default function ProductTable({ products, onEdit, onDelete, sortOrder, onSortChange }: ProductTableProps) {
  const handleSortClick = () => {
    onSortChange(sortOrder === 'asc' ? 'desc' : 'asc');
  };
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-sm bg-white">
      <table className="w-full text-left text-sm min-w-[600px]">
        <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold text-xs border-b border-slate-200">
          <tr>
            <th className="px-3 sm:px-6 py-2 sm:py-4 min-w-[150px]">
                <button 
                  onClick={handleSortClick}
                  className="inline-flex items-center gap-1 hover:text-slate-700 transition-colors"
                >
                  상품명
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    {sortOrder === 'asc' ? (
                      <>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </>
                    ) : (
                      <>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </>
                    )}
                  </svg>
                </button>
              </th>
            <th className="px-3 sm:px-6 py-2 sm:py-4 hidden md:table-cell">바코드 (Code128)</th>
            <th className="px-3 sm:px-6 py-2 sm:py-4 text-right hidden sm:table-cell">CBM</th>
            <th className="px-3 sm:px-6 py-2 sm:py-4 text-right">단가 (USD)</th>
            <th className="px-3 sm:px-6 py-2 sm:py-4 text-right">단가 (RMB)</th>
            <th className="px-3 sm:px-6 py-2 sm:py-4 text-center">상태</th>
            <th className="px-3 sm:px-6 py-2 sm:py-4 text-right">관리</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {products.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-3 sm:px-6 py-12 text-center text-slate-400">
                등록된 상품이 없습니다.
              </td>
            </tr>
          ) : (
            products.map((product) => (
              <tr 
                key={product.id} 
                className="hover:bg-slate-50/50 transition-colors group"
              >
                <td className="px-3 sm:px-6 py-2 sm:py-4">
                  <div className="font-medium text-slate-900 break-keep">{product.name}</div>
                  <div className="text-xs text-slate-400 font-mono mt-1">옵션ID: {product.sku}</div>
                  {product.external_sku && (
                    <div className="text-xs text-blue-500 font-mono">SKU: {product.external_sku}</div>
                  )}
                </td>
                <td className="px-3 sm:px-6 py-2 sm:py-4 hidden md:table-cell">
                  {product.barcode ? (
                    <Barcode 
                      value={product.barcode} 
                      format="CODE128"
                      width={1.2}
                      height={35}
                      fontSize={10}
                      margin={0}
                      background="transparent"
                    />
                  ) : (
                    <span className="text-slate-400 text-xs">-</span>
                  )}
                </td>
                <td className="px-3 sm:px-6 py-2 sm:py-4 text-right tabular-nums text-slate-600 hidden sm:table-cell">
                  {product.cbm?.toFixed(3) || '-'}
                </td>
                <td className="px-3 sm:px-6 py-2 sm:py-4 text-right tabular-nums font-medium text-slate-700 whitespace-nowrap">
                  {product.unit_price_usd ? `$${product.unit_price_usd.toFixed(2)}` : '-'}
                </td>
                <td className="px-3 sm:px-6 py-2 sm:py-4 text-right tabular-nums font-medium text-orange-600 whitespace-nowrap">
                  {product.unit_price_rmb ? `¥${product.unit_price_rmb.toFixed(2)}` : '-'}
                </td>
                <td className="px-3 sm:px-6 py-2 sm:py-4 text-center">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      product.is_active
                        ? 'bg-green-100 text-green-800 border border-green-200'
                        : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}
                  >
                    {product.is_active ? '활성' : '비활성'}
                  </span>
                </td>
                <td className="px-3 sm:px-6 py-2 sm:py-4 text-right">
                  <div className="flex items-center justify-end gap-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onEdit(product)}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                      title="수정"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => onDelete(product.id)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      title="삭제"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
