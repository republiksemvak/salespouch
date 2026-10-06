# Perbaikan Inventaris Sesuai Cetak Biru

## Yang akan dibangun
- Tambahkan tombol **Input Stok Awal** di Master Stok yang membuka modal untuk memilih lokasi, produk, jumlah pack, dan sisa pcs.
- Simpan input tersebut sebagai snapshot fisik awal per lokasi, termasuk untuk produk yang dibuat setelah cut-off, tanpa mencatatnya sebagai produksi atau pembelian.
- Tampilkan rincian setiap produk memakai nama lokasi nyata, seperti **Gudang Utama**, **Dina (Sales)**, dan **Toko Eri (Toko)**.
- Sinkronkan nama lokasi Sales dari `display_name` atau `username`, serta perbaiki data lama yang masih memakai potongan ID.
- Perketat form kunjungan agar total titipan atau jual langsung per produk tidak dapat melampaui saldo fisik Sales.

## Detail teknis
- Tambahkan penanda snapshot pasca cut-off pada stok pembukaan agar saldo lokasi dihitung langsung dan tidak memicu transfer Gudang ke Toko.
- Sediakan fungsi database khusus Owner untuk menyimpan snapshot secara atomik setelah memvalidasi kepemilikan produk, lokasi, dan jumlah.
- Gabungkan jumlah produk yang sama sebelum pengecekan stok di form kunjungan; database tetap menjadi pengaman terakhir terhadap transaksi bersamaan.
- Pertahankan satuan ledger dalam pcs dan tampilkan hasil sebagai pack + sisa pcs.

## Pemeriksaan
- Uji input snapshot ke Gudang, Sales, dan Toko serta pastikan tidak ada mutasi produksi/pembelian.
- Uji nama Sales lama dan baru selalu tampil sebagai nama orang atau username.
- Uji titipan dan jual langsung ditolak ketika total produk melampaui stok Sales, lalu berhasil ketika jumlah mencukupi.
