import unittest
from types import SimpleNamespace

from constellation.devices import pick_device


def fake_torch(cuda: bool, mps: bool | None):
    backends = SimpleNamespace()
    if mps is not None:
        backends.mps = SimpleNamespace(is_available=lambda: mps)
    return SimpleNamespace(
        cuda=SimpleNamespace(is_available=lambda: cuda), backends=backends)


class PickDeviceTests(unittest.TestCase):
    def test_prefers_cuda(self):
        self.assertEqual(pick_device(fake_torch(cuda=True, mps=True)), "cuda")

    def test_uses_apple_gpu_without_cuda(self):
        self.assertEqual(pick_device(fake_torch(cuda=False, mps=True)), "mps")

    def test_falls_back_to_cpu(self):
        self.assertEqual(pick_device(fake_torch(cuda=False, mps=False)), "cpu")
        # MPS 백엔드가 없는 torch 빌드
        self.assertEqual(pick_device(fake_torch(cuda=False, mps=None)), "cpu")


if __name__ == "__main__":
    unittest.main()
