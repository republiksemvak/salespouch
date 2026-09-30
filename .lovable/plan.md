# Pilihan Jenis Kunjungan di Awal

## Yang akan dibangun
- Tambahkan pilihan **Konsinyasi (Titip Barang)** atau **Jual Langsung (Direct Sale)** sebelum kunjungan dimulai.
- Konsinyasi tetap memuat titipan kunjungan sebelumnya dan alur retur/titip baru.
- Jual Langsung langsung membuka pilihan produk Master, tanpa memuat atau menyimpan stok toko.
- Saat nota Jual Langsung disimpan, jumlah terjual mengurangi stok gudang yang sama, lalu masuk ke pembayaran dan struk.
- Beri label **Jual Langsung** pada tampilan, gambar, WhatsApp, dan cetak struk.

## Detail teknis
- Riwayat stok outlet hanya dimuat untuk mode Konsinyasi.
- Jual Langsung disimpan sebagai `transaction_type = Direct Sale`, produk berada di `line_items`, dan `new_consignment_items` tetap kosong.
- Validasi jumlah Jual Langsung tidak boleh melebihi stok gudang saat ini.
