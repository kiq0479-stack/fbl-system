'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

type SettingsTab = 'users' | 'api' | 'notifications' | 'warehouse';

interface SystemUser {
  id: string;
  username: string;
  name: string;
  role: string;
  created_at: string;
}

interface EditUserForm {
  id: string;
  username: string;
  name: string;
  role: string;
  newPassword: string;
}

interface ApiStatus {
  name: string;
  description: string;
  status: 'connected' | 'error' | 'not_configured';
  lastCheck?: string;
  details?: Record<string, string>;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('users');
  const isAdmin = user?.role === 'admin';

  // 사용자 관리 상태
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', name: '', role: 'staff' });
  
  // 사용자 수정 상태
  const [editingUser, setEditingUser] = useState<EditUserForm | null>(null);

  // API 상태
  const [apiStatuses, setApiStatuses] = useState<ApiStatus[]>([]);
  const [apiLoading, setApiLoading] = useState(false);

  // 알림 설정 상태
  const [notifications, setNotifications] = useState({
    lowStock: true,
    newOrder: true,
    inboundComplete: true,
    email: false,
  });

  // 창고 정보 상태
  const [warehouses, setWarehouses] = useState([
    { id: '1', name: '본사 창고', address: '서울시 강남구', type: 'main' },
    { id: '2', name: '쿠팡 물류센터', address: '쿠팡 로켓그로스', type: 'coupang' },
  ]);

  // 사용자 목록 로드
  useEffect(() => {
    if (activeTab === 'users' && isAdmin) {
      loadUsers();
    }
  }, [activeTab, isAdmin]);

  // API 상태 로드
  useEffect(() => {
    if (activeTab === 'api') {
      checkApiStatuses();
    }
  }, [activeTab]);

  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      const res = await fetch('/api/settings/users');
      const data = await res.json();
      if (data.success) {
        setUsers(data.users);
      }
    } catch (error) {
      console.error('Failed to load users:', error);
    }
    setUsersLoading(false);
  };

  const checkApiStatuses = async () => {
    setApiLoading(true);
    try {
      const res = await fetch('/api/settings/api-status');
      const data = await res.json();
      if (data.success) {
        setApiStatuses(data.apis);
      }
    } catch (error) {
      console.error('Failed to check API statuses:', error);
    }
    setApiLoading(false);
  };

  const handleAddUser = async () => {
    if (!newUser.username || !newUser.password || !newUser.name) {
      alert('모든 필드를 입력해주세요.');
      return;
    }

    try {
      const res = await fetch('/api/settings/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      });
      const data = await res.json();
      
      if (data.success) {
        setShowAddUser(false);
        setNewUser({ username: '', password: '', name: '', role: 'staff' });
        loadUsers();
      } else {
        alert(data.error || '사용자 추가 실패');
      }
    } catch (error) {
      alert('네트워크 오류');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    try {
      const res = await fetch(`/api/settings/users?id=${userId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      
      if (data.success) {
        loadUsers();
      } else {
        alert(data.error || '삭제 실패');
      }
    } catch (error) {
      alert('네트워크 오류');
    }
  };

  const handleEditUser = (u: SystemUser) => {
    setEditingUser({
      id: u.id,
      username: u.username,
      name: u.name,
      role: u.role,
      newPassword: '',
    });
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;

    if (!editingUser.name) {
      alert('이름을 입력해주세요.');
      return;
    }

    if (editingUser.newPassword && editingUser.newPassword.length < 6) {
      alert('비밀번호는 6자 이상이어야 합니다.');
      return;
    }

    try {
      const res = await fetch('/api/settings/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingUser.id,
          name: editingUser.name,
          role: editingUser.role,
          newPassword: editingUser.newPassword || undefined,
        }),
      });
      const data = await res.json();
      
      if (data.success) {
        setEditingUser(null);
        loadUsers();
        alert('사용자 정보가 수정되었습니다.');
      } else {
        alert(data.error || '수정 실패');
      }
    } catch (error) {
      alert('네트워크 오류');
    }
  };

  const tabs = [
    { id: 'users' as const, label: '사용자 관리', icon: '👥', adminOnly: true },
    { id: 'api' as const, label: 'API 정보', icon: '🔗', adminOnly: true },
    { id: 'notifications' as const, label: '알림 설정', icon: '🔔', adminOnly: false },
    { id: 'warehouse' as const, label: '창고 정보', icon: '🏭', adminOnly: true },
  ];

  const visibleTabs = tabs.filter(tab => !tab.adminOnly || isAdmin);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">설정</h1>
        <p className="text-sm text-slate-500 mt-1">시스템 설정을 관리합니다.</p>
      </div>

      {/* 탭 */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-4">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* 사용자 관리 */}
      {activeTab === 'users' && isAdmin && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">사용자 목록</h2>
            <button
              onClick={() => setShowAddUser(true)}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              + 사용자 추가
            </button>
          </div>

          {showAddUser && (
            <div className="bg-slate-50 rounded-lg p-4 space-y-4">
              <h3 className="font-medium">새 사용자 추가</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <input
                  type="text"
                  placeholder="아이디"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
                <input
                  type="password"
                  placeholder="비밀번호"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
                <input
                  type="text"
                  placeholder="이름"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                >
                  <option value="staff">직원</option>
                  <option value="manager">매니저</option>
                  <option value="admin">관리자</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAddUser}
                  className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700"
                >
                  추가
                </button>
                <button
                  onClick={() => setShowAddUser(false)}
                  className="px-4 py-2 bg-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-300"
                >
                  취소
                </button>
              </div>
            </div>
          )}

          {/* 사용자 수정 모달 */}
          {editingUser && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4 space-y-4">
                <h3 className="text-lg font-semibold">사용자 수정</h3>
                
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">아이디</label>
                    <input
                      type="text"
                      value={editingUser.username}
                      disabled
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">이름</label>
                    <input
                      type="text"
                      value={editingUser.name}
                      onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">권한</label>
                    <select
                      value={editingUser.role}
                      onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="staff">직원</option>
                      <option value="manager">매니저</option>
                      <option value="admin">관리자</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      새 비밀번호 <span className="text-slate-400 font-normal">(변경 시에만 입력)</span>
                    </label>
                    <input
                      type="password"
                      value={editingUser.newPassword}
                      onChange={(e) => setEditingUser({ ...editingUser, newPassword: e.target.value })}
                      placeholder="변경하지 않으려면 비워두세요"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleUpdateUser}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    저장
                  </button>
                  <button
                    onClick={() => setEditingUser(null)}
                    className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-300 transition-colors"
                  >
                    취소
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-slate-600">아이디</th>
                  <th className="px-6 py-3 text-left font-semibold text-slate-600">이름</th>
                  <th className="px-6 py-3 text-left font-semibold text-slate-600">권한</th>
                  <th className="px-6 py-3 text-left font-semibold text-slate-600">등록일</th>
                  <th className="px-6 py-3 text-center font-semibold text-slate-600">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {usersLoading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-400">로딩 중...</td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-400">등록된 사용자가 없습니다.</td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 font-medium">{u.username}</td>
                      <td className="px-6 py-4">{u.name}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          u.role === 'admin' ? 'bg-red-100 text-red-700' :
                          u.role === 'manager' ? 'bg-blue-100 text-blue-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {u.role === 'admin' ? '관리자' : u.role === 'manager' ? '매니저' : '직원'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-500">
                        {new Date(u.created_at).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="px-6 py-4 text-center space-x-2">
                        <button
                          onClick={() => handleEditUser(u)}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          수정
                        </button>
                        {u.username !== user?.username && (
                          <button
                            onClick={() => handleDeleteUser(u.id)}
                            className="text-red-600 hover:text-red-800 text-sm"
                          >
                            삭제
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* API 정보 */}
      {activeTab === 'api' && isAdmin && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">연동 API 정보</h2>
            <button
              onClick={checkApiStatuses}
              disabled={apiLoading}
              className="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 transition-colors flex items-center gap-2"
            >
              {apiLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  확인 중...
                </>
              ) : (
                <>🔄 상태 새로고침</>
              )}
            </button>
          </div>

          <div className="grid gap-4">
            {apiLoading && apiStatuses.length === 0 ? (
              <div className="text-center py-8 text-slate-400">API 상태 확인 중...</div>
            ) : (
              apiStatuses.map((api, index) => (
                <div key={index} className="bg-white rounded-lg border border-slate-200 p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${
                        api.status === 'connected' ? 'bg-green-500' :
                        api.status === 'error' ? 'bg-red-500' :
                        'bg-yellow-500'
                      }`} />
                      <div>
                        <h3 className="font-semibold text-slate-900">{api.name}</h3>
                        <p className="text-sm text-slate-500">{api.description}</p>
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      api.status === 'connected' ? 'bg-green-100 text-green-700' :
                      api.status === 'error' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {api.status === 'connected' ? '연결됨' :
                       api.status === 'error' ? '오류' : '미설정'}
                    </span>
                  </div>
                  
                  {api.details && Object.keys(api.details).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {Object.entries(api.details).map(([key, value]) => (
                          <div key={key} className="flex justify-between">
                            <span className="text-slate-500">{key}:</span>
                            <span className="font-mono text-slate-700">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {api.lastCheck && (
                    <div className="mt-2 text-xs text-slate-400">
                      마지막 확인: {new Date(api.lastCheck).toLocaleString('ko-KR')}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
            <strong>참고:</strong> API 키는 보안상 Vercel 환경변수에서 관리됩니다. 
            변경이 필요한 경우 Vercel 대시보드에서 수정해주세요.
          </div>
        </div>
      )}

      {/* 알림 설정 */}
      {activeTab === 'notifications' && (
        <div className="max-w-md space-y-4">
          <h2 className="text-lg font-semibold">알림 설정</h2>
          
          <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
            <div className="p-4 flex items-center justify-between">
              <div>
                <div className="font-medium text-slate-900">재고 부족 알림</div>
                <div className="text-sm text-slate-500">재고가 부족할 때 알림을 받습니다.</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifications.lowStock}
                  onChange={(e) => setNotifications({ ...notifications, lowStock: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
            
            <div className="p-4 flex items-center justify-between">
              <div>
                <div className="font-medium text-slate-900">신규 주문 알림</div>
                <div className="text-sm text-slate-500">새 주문이 들어오면 알림을 받습니다.</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifications.newOrder}
                  onChange={(e) => setNotifications({ ...notifications, newOrder: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
            
            <div className="p-4 flex items-center justify-between">
              <div>
                <div className="font-medium text-slate-900">입고 완료 알림</div>
                <div className="text-sm text-slate-500">입고가 완료되면 알림을 받습니다.</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifications.inboundComplete}
                  onChange={(e) => setNotifications({ ...notifications, inboundComplete: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
            
            <div className="p-4 flex items-center justify-between">
              <div>
                <div className="font-medium text-slate-900">이메일 알림</div>
                <div className="text-sm text-slate-500">중요 알림을 이메일로 받습니다.</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifications.email}
                  onChange={(e) => setNotifications({ ...notifications, email: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>

          <p className="text-xs text-slate-400">* 알림 기능은 추후 업데이트 예정입니다.</p>
        </div>
      )}

      {/* 창고 정보 */}
      {activeTab === 'warehouse' && isAdmin && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">창고 정보</h2>
            <button className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
              + 창고 추가
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {warehouses.map((warehouse) => (
              <div key={warehouse.id} className="bg-white rounded-lg border border-slate-200 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-900">{warehouse.name}</h3>
                    <p className="text-sm text-slate-500 mt-1">{warehouse.address}</p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    warehouse.type === 'main' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                  }`}>
                    {warehouse.type === 'main' ? '본사' : '쿠팡'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-slate-400">* 창고 추가/수정 기능은 추후 업데이트 예정입니다.</p>
        </div>
      )}
    </div>
  );
}
