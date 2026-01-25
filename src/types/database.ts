// Supabase Database 타입 정의
// 나중에 supabase gen types로 자동 생성 가능

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// Enum 타입
export type InventoryLocation = 'warehouse' | 'coupang' | 'naver' | 'in_transit'
export type InventoryChangeType = 'in' | 'out' | 'adjust' | 'transfer'
export type OrderStatus = 'requested' | 'pre_registered' | 'shipping' | 'commercial_confirmed' | 'arrived'
export type SalesChannel = 'coupang' | 'naver'
export type UserRole = 'admin' | 'manager' | 'staff'
export type SystemUserRole = 'admin' | 'manager' | 'logistics' | 'marketing' | 'finance' | 'analytics'
export type SyncStatus = 'success' | 'failed'
export type SupplierType = 'YOUBEICHEN' | 'QUYATIMEBABY' | 'OTHER'
export type CoupangOrderStatus = 'ACCEPT' | 'INSTRUCT' | 'DEPARTURE' | 'DELIVERING' | 'FINAL_DELIVERY'
export type InboundStatus = 'pending' | 'in_transit' | 'arrived' | 'completed' | 'cancelled'

export interface Database {
  public: {
    Tables: {
      factories: {
        Row: {
          id: string
          name: string
          address: string | null
          email: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          address?: string | null
          email?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          address?: string | null
          email?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      products: {
        Row: {
          id: string
          name: string
          sku: string
          external_sku: string | null
          barcode: string | null
          category: string
          cbm: number | null
          weight_kg: number | null
          unit_price_usd: number | null
          unit_price_rmb: number | null
          pallet_qty: number | null
          box_qty: number | null
          factory_id: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          sku: string
          external_sku?: string | null
          barcode?: string | null
          category?: string
          cbm?: number | null
          weight_kg?: number | null
          unit_price_usd?: number | null
          unit_price_rmb?: number | null
          pallet_qty?: number | null
          box_qty?: number | null
          factory_id?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          sku?: string
          external_sku?: string | null
          barcode?: string | null
          category?: string
          cbm?: number | null
          weight_kg?: number | null
          unit_price_usd?: number | null
          unit_price_rmb?: number | null
          pallet_qty?: number | null
          box_qty?: number | null
          factory_id?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      supplies: {
        Row: {
          id: string
          name: string
          sku: string
          qr_code: string | null
          unit_name: string
          unit_qty: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          sku: string
          qr_code?: string | null
          unit_name?: string
          unit_qty?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          sku?: string
          qr_code?: string | null
          unit_name?: string
          unit_qty?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      inventory: {
        Row: {
          id: string
          product_id: string | null
          supply_id: string | null
          location: InventoryLocation
          quantity: number
          pallet_count: number | null
          extra_boxes: number | null
          rack_position: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          product_id?: string | null
          supply_id?: string | null
          location: InventoryLocation
          quantity?: number
          pallet_count?: number | null
          extra_boxes?: number | null
          rack_position?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          product_id?: string | null
          supply_id?: string | null
          location?: InventoryLocation
          quantity?: number
          pallet_count?: number | null
          extra_boxes?: number | null
          rack_position?: string | null
          updated_at?: string
        }
      }
      inventory_logs: {
        Row: {
          id: string
          inventory_id: string
          change_type: InventoryChangeType
          change_qty: number
          reason: string | null
          reference_id: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          inventory_id: string
          change_type: InventoryChangeType
          change_qty: number
          reason?: string | null
          reference_id?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          inventory_id?: string
          change_type?: InventoryChangeType
          change_qty?: number
          reason?: string | null
          reference_id?: string | null
          created_by?: string | null
          created_at?: string
        }
      }
      orders: {
        Row: {
          id: string
          order_number: string
          supplier: SupplierType
          status: OrderStatus
          ship_name: string | null
          etd: string | null
          eta: string | null
          total_cbm: number | null
          total_amount_usd: number | null
          total_amount_rmb: number | null
          pre_invoice_file: string | null
          commercial_invoice_file: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          order_number: string
          supplier: SupplierType
          status?: OrderStatus
          ship_name?: string | null
          etd?: string | null
          eta?: string | null
          total_cbm?: number | null
          total_amount_usd?: number | null
          total_amount_rmb?: number | null
          pre_invoice_file?: string | null
          commercial_invoice_file?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          order_number?: string
          supplier?: SupplierType
          status?: OrderStatus
          ship_name?: string | null
          etd?: string | null
          eta?: string | null
          total_cbm?: number | null
          total_amount_usd?: number | null
          total_amount_rmb?: number | null
          pre_invoice_file?: string | null
          commercial_invoice_file?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          product_id: string
          pre_qty: number
          commercial_qty: number | null
          unit_price_usd: number | null
          unit_price_rmb: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          order_id: string
          product_id: string
          pre_qty?: number
          commercial_qty?: number | null
          unit_price_usd?: number | null
          unit_price_rmb?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          product_id?: string
          pre_qty?: number
          commercial_qty?: number | null
          unit_price_usd?: number | null
          unit_price_rmb?: number | null
          created_at?: string
          updated_at?: string
        }
      }
      order_item_changes: {
        Row: {
          id: string
          order_item_id: string
          pre_qty: number
          commercial_qty: number
          diff_qty: number
          changed_at: string
        }
        Insert: {
          id?: string
          order_item_id: string
          pre_qty: number
          commercial_qty: number
          changed_at?: string
        }
        Update: {
          id?: string
          order_item_id?: string
          pre_qty?: number
          commercial_qty?: number
          changed_at?: string
        }
      }
      sales: {
        Row: {
          id: string
          channel: SalesChannel
          channel_order_id: string | null
          product_id: string
          quantity: number
          sale_price: number | null
          sold_at: string
          synced_at: string
        }
        Insert: {
          id?: string
          channel: SalesChannel
          channel_order_id?: string | null
          product_id: string
          quantity: number
          sale_price?: number | null
          sold_at: string
          synced_at?: string
        }
        Update: {
          id?: string
          channel?: SalesChannel
          channel_order_id?: string | null
          product_id?: string
          quantity?: number
          sale_price?: number | null
          sold_at?: string
          synced_at?: string
        }
      }
      sales_daily: {
        Row: {
          id: string
          product_id: string
          channel: SalesChannel
          sale_date: string
          total_qty: number
          total_amount: number
        }
        Insert: {
          id?: string
          product_id: string
          channel: SalesChannel
          sale_date: string
          total_qty?: number
          total_amount?: number
        }
        Update: {
          id?: string
          product_id?: string
          channel?: SalesChannel
          sale_date?: string
          total_qty?: number
          total_amount?: number
        }
      }
      users: {
        Row: {
          id: string
          email: string
          name: string | null
          role: UserRole
          is_active: boolean
          created_at: string
        }
        Insert: {
          id: string
          email: string
          name?: string | null
          role?: UserRole
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          name?: string | null
          role?: UserRole
          is_active?: boolean
          created_at?: string
        }
      }
      api_sync_logs: {
        Row: {
          id: string
          channel: SalesChannel
          sync_type: string
          status: SyncStatus
          records_count: number
          error_message: string | null
          started_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          channel: SalesChannel
          sync_type: string
          status: SyncStatus
          records_count?: number
          error_message?: string | null
          started_at?: string
          completed_at?: string | null
        }
        Update: {
          id?: string
          channel?: SalesChannel
          sync_type?: string
          status?: SyncStatus
          records_count?: number
          error_message?: string | null
          started_at?: string
          completed_at?: string | null
        }
      }
      coupang_orders: {
        Row: {
          id: string
          shipment_box_id: number
          order_id: number
          ordered_at: string
          orderer_name: string
          orderer_phone: string | null
          receiver_name: string
          receiver_phone: string
          receiver_addr1: string
          receiver_addr2: string | null
          receiver_zip_code: string
          status: CoupangOrderStatus
          paid_at: string | null
          shipping_price: number | null
          remote_area_price: number | null
          parcel_print_message: string | null
          synced_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          shipment_box_id: number
          order_id: number
          ordered_at: string
          orderer_name: string
          orderer_phone?: string | null
          receiver_name: string
          receiver_phone: string
          receiver_addr1: string
          receiver_addr2?: string | null
          receiver_zip_code: string
          status: CoupangOrderStatus
          paid_at?: string | null
          shipping_price?: number | null
          remote_area_price?: number | null
          parcel_print_message?: string | null
          synced_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          shipment_box_id?: number
          order_id?: number
          ordered_at?: string
          orderer_name?: string
          orderer_phone?: string | null
          receiver_name?: string
          receiver_phone?: string
          receiver_addr1?: string
          receiver_addr2?: string | null
          receiver_zip_code?: string
          status?: CoupangOrderStatus
          paid_at?: string | null
          shipping_price?: number | null
          remote_area_price?: number | null
          parcel_print_message?: string | null
          synced_at?: string
          created_at?: string
          updated_at?: string
        }
      }
      coupang_order_items: {
        Row: {
          id: string
          coupang_order_id: string
          vendor_item_id: number
          vendor_item_name: string
          shipping_count: number
          sales_price: number
          order_price: number
          discount_price: number | null
          external_vendor_sku_code: string | null
          seller_product_id: number
          seller_product_name: string
          seller_product_item_name: string | null
          created_at: string
        }
        Insert: {
          id?: string
          coupang_order_id: string
          vendor_item_id: number
          vendor_item_name: string
          shipping_count: number
          sales_price: number
          order_price: number
          discount_price?: number | null
          external_vendor_sku_code?: string | null
          seller_product_id: number
          seller_product_name: string
          seller_product_item_name?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          coupang_order_id?: string
          vendor_item_id?: number
          vendor_item_name?: string
          shipping_count?: number
          sales_price?: number
          order_price?: number
          discount_price?: number | null
          external_vendor_sku_code?: string | null
          seller_product_id?: number
          seller_product_name?: string
          seller_product_item_name?: string | null
          created_at?: string
        }
      }
      rocket_growth_orders: {
        Row: {
          id: string
          order_id: number
          vendor_id: string
          paid_at: string | null
          raw_data: Json | null
          synced_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          order_id: number
          vendor_id: string
          paid_at?: string | null
          raw_data?: Json | null
          synced_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          order_id?: number
          vendor_id?: string
          paid_at?: string | null
          raw_data?: Json | null
          synced_at?: string
          created_at?: string
          updated_at?: string
        }
      }
      rocket_growth_order_items: {
        Row: {
          id: string
          rocket_growth_order_id: string
          vendor_item_id: number
          product_name: string
          sales_quantity: number
          sales_price: number
          currency: string | null
          created_at: string
        }
        Insert: {
          id?: string
          rocket_growth_order_id: string
          vendor_item_id: number
          product_name: string
          sales_quantity: number
          sales_price: number
          currency?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          rocket_growth_order_id?: string
          vendor_item_id?: number
          product_name?: string
          sales_quantity?: number
          sales_price?: number
          currency?: string | null
          created_at?: string
        }
      }
      system_users: {
        Row: {
          id: string
          username: string
          password: string
          role: SystemUserRole
          name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          username: string
          password: string
          role: SystemUserRole
          name: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          username?: string
          password?: string
          role?: SystemUserRole
          name?: string
          created_at?: string
          updated_at?: string
        }
      }
      coupang_revenues: {
        Row: {
          id: string
          order_id: string
          vendor_id: string
          vendor_item_id: string
          vendor_item_name: string
          quantity: number
          sale_price: number
          discount_price: number
          settlement_price: number
          recognized_at: string
          ordered_at: string
          delivered_at: string | null
          shipment_type: string
          seller_product_id: string
          seller_product_name: string
          raw_data: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          order_id: string
          vendor_id: string
          vendor_item_id: string
          vendor_item_name: string
          quantity: number
          sale_price: number
          discount_price?: number
          settlement_price: number
          recognized_at: string
          ordered_at: string
          delivered_at?: string | null
          shipment_type: string
          seller_product_id: string
          seller_product_name: string
          raw_data?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          vendor_id?: string
          vendor_item_id?: string
          vendor_item_name?: string
          quantity?: number
          sale_price?: number
          discount_price?: number
          settlement_price?: number
          recognized_at?: string
          ordered_at?: string
          delivered_at?: string | null
          shipment_type?: string
          seller_product_id?: string
          seller_product_name?: string
          raw_data?: Json | null
          created_at?: string
          updated_at?: string
        }
      }
    }
    Enums: {
      inventory_location: InventoryLocation
      inventory_change_type: InventoryChangeType
      order_status: OrderStatus
      sales_channel: SalesChannel
      user_role: UserRole
      sync_status: SyncStatus
      supplier_type: SupplierType
      coupang_order_status: CoupangOrderStatus
      inbound_status: InboundStatus
    }
  }
}

// 업체(벤더) 타입 - API 연동된 업체
export interface Vendor {
  id: string
  name: string
  vendor_id: string // 쿠팡 VENDOR_ID 등
  platform: 'coupang' | 'naver'
  is_active: boolean
}

// 하드코딩된 업체 목록 (나중에 DB로 이동 가능)
export const VENDORS: Vendor[] = [
  { id: '1', name: '컴팩트우디', vendor_id: 'A01241550', platform: 'coupang', is_active: true },
]

// 입고 요청 타입
export interface InboundRequest {
  id: string
  request_number: string
  vendor_id: string // 업체 ID
  vendor_name?: string // 업체명 (조회용)
  status: InboundStatus
  warehouse_name: string
  expected_date: string
  total_pallets: number
  total_boxes: number
  total_quantity: number
  notes: string | null
  created_at: string
  updated_at: string
  items?: InboundItem[]
}

export interface InboundItem {
  id: string
  inbound_request_id: string
  pallet_number: number
  sku: string
  product_name: string
  box_quantity: number
  quantity: number
  vendor_item_id: number | null
  created_at: string
  updated_at: string
}
