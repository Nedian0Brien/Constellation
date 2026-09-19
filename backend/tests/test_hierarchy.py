"""hierarchy의 순수 함수: 이웃 그래프, 제약 Ward, 절단, 지표."""
import unittest

import numpy as np

from constellation.analyze import hierarchy as h


class EdgeTests(unittest.TestCase):
    def test_prunes_long_edges_but_stays_connected(self):
        # 왼쪽 뭉치 4점, 오른쪽 외딴 1점. 긴 변은 빠지되 외딴 점을 잇는 가장 짧은
        # 변 하나는 되살아난다.
        xy = np.array([[0, 0], [1, 0], [0, 1], [1, 1], [20, 0.5]], float)
        edges = h.delaunay_edges(xy, prune_ratio=2.0)
        self.assertTrue(h._connected(5, edges))
        far = [e for e in edges if 4 in e]
        self.assertEqual(far, [(1, 4)] if (1, 4) in edges else [(3, 4)])
        self.assertEqual(len(far), 1)

    def test_tiny_inputs_are_complete_graphs(self):
        self.assertEqual(h.delaunay_edges(np.zeros((2, 2))), {(0, 1)})


class ConstrainedWardTests(unittest.TestCase):
    def test_only_neighbours_merge(self):
        # 0과 3은 임베딩이 같지만 이웃이 아니다. 0-1-2-3 사슬.
        X = np.array([[0, 0], [10, 0], [10, 10], [0, 0]], float)
        edges = {(0, 1), (1, 2), (2, 3)}
        Z = h.constrained_ward(X, edges)
        self.assertEqual(Z.shape, (3, 4))
        # 첫 병합은 인접 쌍 중 가장 싼 (0,1) 또는 (2,3)(둘 다 비용 50). 동률은 낮은 쪽.
        self.assertEqual((int(Z[0, 0]), int(Z[0, 1])), (0, 1))
        self.assertAlmostEqual(Z[0, 2], 0.5 * 100)
        self.assertEqual(Z[-1, 3], 4)
        # 어떤 단계에서도 0과 3이 직접 합쳐지지 않았다
        self.assertNotIn((0, 3), {(int(a), int(b)) for a, b, _, _ in Z})

    def test_disconnected_graph_is_rejected(self):
        with self.assertRaises(ValueError):
            h.constrained_ward(np.zeros((3, 2)), {(0, 1)})


class CutTests(unittest.TestCase):
    #        5 (h=0.5)
    #      /   \
    #     3     4 (h=0.3, 0.1)
    #    / \   / \
    #   0   1 2   3
    def test_monotone_heights_and_threshold_cut(self):
        Z = np.array([[0, 1, 0.3, 2], [2, 3, 0.1, 2], [4, 5, 0.05, 4]])  # 마지막 비용이 더 낮다(비단조)
        heights = h.monotone_heights(Z)
        self.assertEqual(list(heights), [0, 0, 0, 0, 0.3, 0.1, 0.3])
        parent = [4, 4, 5, 5, 6, 6, None]
        cut = h.cut_by_height(heights, parent, (0.2, 0.05))
        self.assertEqual(cut, {0: [0, 1, 5], 1: [0, 1, 2, 3]})

    def test_count_cut_picks_covering_node(self):
        Z = np.array([[0, 1, 1.0, 2], [2, 3, 1.5, 2], [4, 5, 3.0, 4]])
        parent = [4, 4, 5, 5, 6, 6, None]
        members = [[10], [11], [12], [13], [10, 11], [12, 13], [10, 11, 12, 13]]
        self.assertEqual(h.cut_by_count(Z, parent, members, (2, 3)),
                         {0: [4, 5], 1: [4, 2, 3]})


class MetricTests(unittest.TestCase):
    def test_group_metrics(self):
        leaf_size = {0: 10, 1: 10, 2: 20}
        paper_xy = {0: np.array([[0, 0], [0, 2]]), 1: np.array([[1, 0], [1, 2]]),
                    2: np.array([[10, 0], [10, 2]])}
        leaf_C = {0: np.array([1.0, 0]), 1: np.array([1.0, 0]), 2: np.array([0, 1.0])}
        cites = [(0, 1), (0, 1), (1, 2), (2, 2)]
        m = h.group_metrics([[0, 1], [2]], leaf_size, paper_xy, leaf_C, cites)
        self.assertEqual(m["groups"], 2)
        self.assertAlmostEqual(m["max_share"], 0.5)
        self.assertAlmostEqual(m["cohesion"], (1.0 * 2 + 1.0 * 1) / 3)
        # 그룹 안 인용 3/4, 무작위 기준 0.5² + 0.5² = 0.5 → 1.5배
        self.assertAlmostEqual(m["lift"], 0.75 / 0.5)
        self.assertGreater(m["spread"], 0)
        self.assertLess(m["spread"], 1)


if __name__ == "__main__":
    unittest.main()
