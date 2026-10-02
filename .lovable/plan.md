# Edit Profil Toko

## Yang akan dibangun
- Tambahkan data pemilik toko, alamat, dan catatan rute pada setiap outlet; nama dan nomor telepon tetap memakai data outlet yang sudah ada.
- Buat halaman edit toko khusus Owner dengan isian nama toko, nama pemilik, nomor telepon, alamat, lokasi peta, catatan rute, dan foto toko.
- Tambahkan tombol edit pada setiap toko di halaman utama, hanya terlihat bagi Owner.
- Lengkapi formulir tambah toko agar data baru juga dapat dicatat sejak awal.

## Detail teknis
- Tambahkan kolom `owner_name`, `address`, dan `route_notes` ke data outlet tanpa mengubah data lama.
- Simpan perubahan melalui aturan akses yang sudah membatasi edit outlet kepada Owner.
- Perbarui daftar toko setelah penyimpanan dan kembali ke halaman utama.

## Pemeriksaan
- Pastikan Owner dapat membuka, mengubah, dan menyimpan profil toko.
- Pastikan tombol edit tidak tampil untuk Sales.
