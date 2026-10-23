-- MySQL dump 10.13  Distrib 8.0.36, for Linux (x86_64)
--
-- Host: localhost    Database: casa_tierra_shop
-- ------------------------------------------------------
-- Server version	8.0.36
--
-- A supplier handed over their product table instead of a spreadsheet. CatalogForge reads the
-- INSERT rows in memory and never executes anything here: the DROP TABLE below is ignored.

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;

--
-- Table structure for table `products`
--

DROP TABLE IF EXISTS `products`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `products` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sku` varchar(32) NOT NULL,
  `parent_sku` varchar(32) DEFAULT NULL,
  `title` varchar(255) NOT NULL,
  `description` text,
  `category` varchar(255) DEFAULT NULL,
  `brand` varchar(64) DEFAULT NULL,
  `price` varchar(20) DEFAULT NULL COMMENT 'typed in by hand, mixed formats',
  `currency` varchar(8) DEFAULT NULL,
  `size` varchar(32) DEFAULT NULL,
  `colour` varchar(32) DEFAULT NULL,
  `weight_g` int DEFAULT NULL,
  `image` varchar(255) DEFAULT NULL,
  `notes` text,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sku` (`sku`),
  KEY `idx_parent` (`parent_sku`),
  CONSTRAINT `fk_products_category` FOREIGN KEY (`category`) REFERENCES `categories` (`path`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `products`
--

LOCK TABLES `products` WRITE;
/*!40000 ALTER TABLE `products` DISABLE KEYS */;
INSERT INTO `products` (`id`, `sku`, `parent_sku`, `title`, `description`, `category`, `brand`, `price`, `currency`, `size`, `colour`, `weight_g`, `image`, `notes`, `updated_at`) VALUES
(1,'TC-PL-20','TC-PL','Terracotta Planter','Classic unglazed terracotta planter with a drainage hole and a matching saucer. The porous clay lets roots breathe and keeps soil from waterlogging. Handmade in Portugal, so small variations in colour and shape are part of each piece.','Home & Garden > Decor > Planters','Casa Tierra','12.50','EUR','20 cm',NULL,900,'TC-PL-20.jpg','Frost-resistant (not frost-proof, bring indoors below 0 °C). Handmade in Portugal.','2026-09-30 10:12:04'),
(2,'TC-PL-30','TC-PL','Terracotta Planter','Classic unglazed terracotta planter with a drainage hole and a matching saucer. The porous clay lets roots breathe and keeps soil from waterlogging. Handmade in Portugal, so small variations in colour and shape are part of each piece.','Home & Garden > Decor > Planters','Casa Tierra','18,75','EUR','30 cm',NULL,1350,'TC-PL-30.jpg','Frost-resistant (not frost-proof, bring indoors below 0 °C). Handmade in Portugal.','2026-09-30 10:12:04'),
(3,'TC-PL-40','TC-PL','Terracotta Planter','Classic unglazed terracotta planter with a drainage hole and a matching saucer. The porous clay lets roots breathe and keeps soil from waterlogging. Handmade in Portugal, so small variations in colour and shape are part of each piece.','Home & Garden > Decor > Planters','Casa Tierra','27.50 €',NULL,'40 cm',NULL,1980,'TC-PL-40.jpg','Frost-resistant (not frost-proof, bring indoors below 0 °C). Handmade in Portugal.','2026-09-30 10:12:04'),
(4,'TC-MG-01','TC-MG','Stoneware Mug','Wheel-thrown stoneware mug with a generous 350 ml capacity and a comfortable looped handle. The satin glaze is dishwasher-safe and microwave-safe for everyday use. Because each mug is thrown by hand, no two are exactly alike.','Home & Garden > Kitchen & Dining > Tableware > Drinkware > Mugs','Casa Tierra','14.50','EUR',NULL,'cream',380,'TC-MG-01.jpg','Dishwasher-safe and microwave-safe, not oven-safe.','2026-10-02 08:00:00'),
(5,'TC-MG-02','TC-MG','Stoneware Mug','Wheel-thrown stoneware mug with a generous 350 ml capacity and a comfortable looped handle. The satin glaze is dishwasher-safe and microwave-safe for everyday use. Because each mug is thrown by hand, no two are exactly alike.','Home & Garden > Kitchen & Dining > Tableware > Drinkware > Mugs','Casa Tierra','EUR 14.50',NULL,NULL,'dark blue',380,'TC-MG-02.jpg','Dishwasher-safe and microwave-safe, not oven-safe.','2026-10-02 08:00:00'),
(6,'TC-MG-03','TC-MG','Stoneware Mug','Wheel-thrown stoneware mug with a generous 350 ml capacity and a comfortable looped handle. The satin glaze is dishwasher-safe and microwave-safe for everyday use. Because each mug is thrown by hand, no two are exactly alike.','Home & Garden > Kitchen & Dining > Tableware > Drinkware > Mugs','Casa Tierra','14,50 €',NULL,NULL,'sage green',380,'TC-MG-03.jpg','Dishwasher-safe and microwave-safe, not oven-safe.','2026-10-02 08:00:00'),
(7,'CI-SK-20','CI-SK','Cast-Iron Skillet','Pre-seasoned cast-iron skillet with two pour spouts and a helper handle. Oven-safe to 260 °C and induction compatible, it goes from hob to oven to table. Builds a natural non-stick surface with use.','Home & Garden > Kitchen & Dining > Cookware > Pots & Pans','Oliva','€ 45,00',NULL,'20 cm',NULL,1800,'CI-SK-20.jpg','Never soak; not dishwasher-safe. Dry and oil after washing.','2026-10-05 16:40:21'),
(8,'CI-SK-26','CI-SK','Cast-Iron Skillet','Pre-seasoned cast-iron skillet with two pour spouts and a helper handle. Oven-safe to 260 °C and induction compatible, it goes from hob to oven to table. Builds a natural non-stick surface with use.','Home & Garden > Kitchen & Dining > Cookware > Pots & Pans','Oliva','67.5','EUR','26 cm',NULL,2700,'CI-SK-26.jpg','Never soak; not dishwasher-safe. Dry and oil after washing.','2026-10-05 16:40:21'),
(9,'DN-PL-WH','DN-PL','Dinner Plate','27 cm dinner plate in vitrified stoneware with a raised rim and a matte outer edge. Chip-resistant and dishwasher-safe for daily use. Made to be mixed with the rest of the range.','Home & Garden > Kitchen & Dining > Tableware > Dinnerware > Plates','Casa Tierra','16.00','EUR',NULL,'white',650,'DN-PL-WH.jpg','Chip-resistant stoneware, not unbreakable.','2026-10-05 16:40:21'),
(10,'DN-PL-CH','DN-PL','Dinner Plate','27 cm dinner plate in vitrified stoneware with a raised rim and a matte outer edge. Chip-resistant and dishwasher-safe for daily use. Made to be mixed with the rest of the range.','Home & Garden > Kitchen & Dining > Tableware > Dinnerware > Plates','Casa Tierra',NULL,'EUR',NULL,'charcoal',650,'DN-PL-CH.jpg','Chip-resistant stoneware, not unbreakable. Price to be confirmed.','2026-10-05 16:40:21'),
(11,'LN-CU-45-NT','LN-CU','Linen Cushion Cover','Stonewashed 100% European linen cushion cover with a concealed zip. The fabric softens further with every wash; the 45 x 45 cm size fits a standard inner. Woven in O\'Brien\'s mill in County Down.','Home & Garden > Decor > Cushions','Northline','1.299,00',NULL,'45 x 45 cm','natural',210,'linen-cushion-cover.jpg','Machine wash at 40 °C, do not tumble dry. Sold without inner.','2026-10-11 09:05:33'),
(12,'WL-TH-01','WL-TH','Wool Throw','Lambswool throw with a ''herringbone'' weave and a blanket-stitched edge. Warm but light, it drapes well over a sofa or the end of a bed.','Home & Garden > Decor > Throws','Northline','89,00','EUR','130 x 180 cm','oat',780,'wool-throw.jpg','Dry clean only; not machine washable.','2026-10-11 09:05:33');
/*!40000 ALTER TABLE `products` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `categories`
--

DROP TABLE IF EXISTS `categories`;
CREATE TABLE `categories` (
  `id` int NOT NULL AUTO_INCREMENT,
  `path` varchar(255) NOT NULL,
  `sort_order` int DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- Dumping data for table `categories`
--

LOCK TABLES `categories` WRITE;
INSERT INTO `categories` VALUES (1,'Home & Garden > Decor > Planters',10),(2,'Home & Garden > Kitchen & Dining > Cookware > Pots & Pans',20),(3,'Home & Garden > Decor > Cushions',30);
UNLOCK TABLES;

/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;

-- Dump completed on 2026-10-22 18:03:41
