import unittest

from constellation import queries


class PhysicalAISetTests(unittest.TestCase):
    def test_two_sets_share_years_and_split_the_yearly_quota(self):
        robot, drive = queries.get("physical-ai"), queries.get("physical-ai-driving")
        self.assertEqual((robot.year_from, robot.year_to), (2014, 2026))
        self.assertEqual((drive.year_from, drive.year_to), (2014, 2026))
        self.assertEqual(robot.per_year + drive.per_year, 1200)

    def test_broad_terms_are_narrowed_to_robotics(self):
        filt = queries.get("physical-ai").filter_for_year(2020)
        self.assertIn('("world model" AND (robot OR robotic OR embodied))', filt)
        self.assertIn('("imitation learning" AND (robot OR robotic))', filt)
        self.assertNotIn('"autonomous driving"', filt)
        self.assertTrue(filt.endswith(
            "publication_year:2020,type:article|preprint|conference-paper"))

    def test_driving_filter(self):
        filt = queries.get("physical-ai-driving").filter_for_year(2014)
        self.assertTrue(filt.startswith(
            'title_and_abstract.search:"autonomous driving" OR "self-driving"'))


if __name__ == "__main__":
    unittest.main()
