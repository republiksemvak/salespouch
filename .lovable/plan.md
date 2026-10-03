# Skema Stok Toko

## Yang akan dibangun
- Tambahkan pilihan Owner di Profil Usaha: **Akumulasi** atau **Tarik Bersih**. Data lama tetap memakai Tarik Bersih agar perilaku saat ini tidak berubah.
- Pada kunjungan konsinyasi, pisahkan input **Sisa di rak** dan **Retur fisik ke gudang** untuk setiap produk.
- Skema Akumulasi menghitung `terjual = stok awal − sisa di rak − retur fisik`, lalu stok toko berikutnya menjadi `sisa di rak + titip baru`.
- Skema Tarik Bersih menghitung `terjual = stok awal − retur fisik`, tidak menyisakan stok lama di toko, lalu stok toko berikutnya hanya `titip baru`.
- Tampilkan skema aktif serta rincian sisa rak, retur fisik, dan terjual secara tegas pada form, nota layar, PNG, WhatsApp, dan cetak thermal.

## Detail teknis
- Simpan skema pilihan pada profil usaha dan snapshot skema pada setiap transaksi agar nota lama serta revisinya tidak berubah saat Owner mengganti pengaturan.
- Tetap gunakan kolom JSON yang ada: `remaining` khusus sisa rak dan `returned` khusus retur fisik.
- Sesuaikan pemuatan stok toko, ringkasan Master Produk, mutasi stok gudang, serta fungsi revisi transaksi agar hanya retur fisik yang masuk kembali ke gudang.
- Terapkan validasi atomik bahwa `terjual + sisa rak + retur fisik = stok awal` dan stok gudang tidak boleh negatif.

## Pemeriksaan
- Uji kedua skema pada kunjungan pertama dan rutin, termasuk kombinasi pack + pcs.
- Uji perubahan skema hanya memengaruhi transaksi baru, sedangkan revisi memakai skema transaksi asal.
- Uji nota dan Master Produk membedakan sisa rak dari retur fisik.
