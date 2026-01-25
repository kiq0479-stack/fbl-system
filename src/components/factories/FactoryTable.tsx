'use client';

import { Database } from '@/types/database';

type Factory = Database['public']['Tables']['factories']['Row'];

interface FactoryTableProps {
  factories: Factory[];
  onEdit: (factory: Factory) => void;
  onDelete: (id: string) => void;
}

export default function FactoryTable({ factories, onEdit, onDelete }: FactoryTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-sm bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold text-xs border-b border-slate-200">
          <tr>
            <th className="px-6 py-4">공장명</th>
            <th className="px-6 py-4">주소</th>
            <th className="px-6 py-4">이메일</th>
            <th className="px-6 py-4 text-center">상태</th>
            <th className="px-6 py-4 text-right">관리</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {factories.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                등록된 공장이 없습니다.
              </td>
            </tr>
          ) : (
            factories.map((factory) => (
              <tr 
                key={factory.id} 
                className="hover:bg-slate-50/50 transition-colors group"
              >
                <td className="px-6 py-4">
                  <div className="font-medium text-slate-900">{factory.name}</div>
                </td>
                <td className="px-6 py-4 text-slate-600 max-w-xs truncate" title={factory.address || ''}>
                  {factory.address || '-'}
                </td>
                <td className="px-6 py-4 text-slate-600">
                  {factory.email || '-'}
                </td>
                <td className="px-6 py-4 text-center">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      factory.is_active
                        ? 'bg-green-100 text-green-800 border border-green-200'
                        : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}
                  >
                    {factory.is_active ? '활성' : '비활성'}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onEdit(factory)}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                      title="수정"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => onDelete(factory.id)}
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
