import unittest

from selfhost_importer import is_allowed_import_url, is_flac_response, sanitize_filename


class SelfhostImporterTests(unittest.TestCase):
    def test_allows_only_http_and_https_urls(self):
        self.assertTrue(is_allowed_import_url('https://example.test/song.flac'))
        self.assertTrue(is_allowed_import_url('http://example.test/song.flac'))
        self.assertFalse(is_allowed_import_url('file:///etc/passwd'))
        self.assertFalse(is_allowed_import_url('ftp://example.test/song.flac'))

    def test_accepts_flac_by_content_type_or_extension(self):
        self.assertTrue(is_flac_response('audio/flac', 'https://example.test/song'))
        self.assertTrue(is_flac_response('application/octet-stream', 'https://example.test/song.FLAC'))
        self.assertFalse(is_flac_response('audio/mpeg', 'https://example.test/song.mp3'))

    def test_sanitizes_download_filename(self):
        self.assertEqual(sanitize_filename('Instant Destiny.flac'), 'Instant_Destiny.flac')
        self.assertEqual(sanitize_filename('../../secret.flac'), 'secret.flac')
        self.assertEqual(sanitize_filename(''), 'import.flac')


if __name__ == '__main__':
    unittest.main()
