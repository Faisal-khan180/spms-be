-- =====================================================================
-- Smart Placement Management System — Database Schema (Full)
-- =====================================================================
-- Run via: npm run db:migrate  (see database/migrate.js, selects DB_NAME)
-- Engine: InnoDB everywhere (foreign keys + transactions).
-- Charset: utf8mb4 everywhere (emoji-safe, standard for new MySQL apps).
-- =====================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- 1. users — shared identity/auth table for all three roles
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`          VARCHAR(150) NOT NULL,
  `email`         VARCHAR(150) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role`          ENUM('student', 'company', 'admin') NOT NULL,
  `phone`         VARCHAR(20)  DEFAULT NULL,
  `is_active`     TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                               ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`),
  KEY `idx_users_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 2. students — 1:1 profile for role='student' users
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `students` (
  `id`                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`             INT UNSIGNED NOT NULL,
  `roll_number`         VARCHAR(50)  NOT NULL,
  `course`              VARCHAR(100) DEFAULT NULL,
  `branch`              VARCHAR(100) NOT NULL,
  `degree`              VARCHAR(50)  NOT NULL DEFAULT 'B.Tech',
  `batch_year`          YEAR         NOT NULL,
  `passing_year`        YEAR         DEFAULT NULL,
  `cgpa`                DECIMAL(4,2) NOT NULL DEFAULT 0.00,
  `backlog_count`       INT UNSIGNED NOT NULL DEFAULT 0,
  `tenth_percentage`    DECIMAL(5,2) DEFAULT NULL,
  `twelfth_percentage`  DECIMAL(5,2) DEFAULT NULL,
  `gender`              ENUM('male', 'female', 'other') DEFAULT NULL,
  `dob`                 DATE         DEFAULT NULL,
  `address`             VARCHAR(255) DEFAULT NULL,
  `resume_url`          VARCHAR(255) DEFAULT NULL,
  `verification_status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  `rejection_reason`    TEXT         DEFAULT NULL,
  `created_at`          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                                     ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_students_user_id` (`user_id`),
  UNIQUE KEY `uq_students_roll_number` (`roll_number`),
  KEY `idx_students_branch` (`branch`),
  KEY `idx_students_batch_year` (`batch_year`),
  CONSTRAINT `fk_students_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 3. student_skills — skills per student (for eligibility matching)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `student_skills` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id` INT UNSIGNED NOT NULL,
  `skill_name` VARCHAR(100) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_student_skill` (`student_id`, `skill_name`),
  CONSTRAINT `fk_student_skills_student`
    FOREIGN KEY (`student_id`) REFERENCES `students` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 4. student_projects — project showcase
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `student_projects` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`   INT UNSIGNED NOT NULL,
  `title`        VARCHAR(150) NOT NULL,
  `description`  TEXT         DEFAULT NULL,
  `tech_stack`   VARCHAR(255) DEFAULT NULL COMMENT 'Comma-separated, e.g. "Node.js, MySQL, React"',
  `project_url`  VARCHAR(255) DEFAULT NULL,
  `created_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_projects_student` (`student_id`),
  CONSTRAINT `fk_projects_student`
    FOREIGN KEY (`student_id`) REFERENCES `students` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 5. student_certifications — student certifications
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `student_certifications` (
  `id`                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`            INT UNSIGNED NOT NULL,
  `title`                 VARCHAR(150) NOT NULL,
  `issuing_organization`  VARCHAR(150) DEFAULT NULL,
  `issue_date`            DATE         DEFAULT NULL,
  `credential_url`        VARCHAR(255) DEFAULT NULL,
  `created_at`            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_certifications_student` (`student_id`),
  CONSTRAINT `fk_certifications_student`
    FOREIGN KEY (`student_id`) REFERENCES `students` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 6. companies — 1:1 profile for role='company' users
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `companies` (
  `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`          INT UNSIGNED NOT NULL,
  `company_name`     VARCHAR(150) NOT NULL,
  `industry`         VARCHAR(100) DEFAULT NULL,
  `website`          VARCHAR(255) DEFAULT NULL,
  `description`      TEXT         DEFAULT NULL,
  `hr_contact_name`  VARCHAR(150) DEFAULT NULL,
  `hr_contact_phone` VARCHAR(20)  DEFAULT NULL,
  `is_approved`      TINYINT(1)   NOT NULL DEFAULT 0,
  `created_at`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_companies_user_id` (`user_id`),
  KEY `idx_companies_is_approved` (`is_approved`),
  CONSTRAINT `fk_companies_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 7. placement_drives — jobs/drives posted by companies
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `placement_drives` (
  `id`                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `company_id`             INT UNSIGNED NOT NULL,
  `title`                  VARCHAR(150) NOT NULL,
  `description`            TEXT         DEFAULT NULL,
  `job_type`               ENUM('full_time', 'internship', 'ppo') NOT NULL DEFAULT 'full_time',
  `work_mode`              ENUM('on_site', 'remote', 'hybrid') NOT NULL DEFAULT 'on_site',
  `location`               VARCHAR(150) DEFAULT NULL,
  `package_ctc`            DECIMAL(10,2) DEFAULT NULL COMMENT 'Annual CTC in LPA',
  `num_openings`           INT UNSIGNED NOT NULL DEFAULT 1,
  `selection_process`      TEXT         DEFAULT NULL,
  `eligible_course`        VARCHAR(100) DEFAULT NULL,
  `passing_year`           YEAR         DEFAULT NULL,
  `min_cgpa`               DECIMAL(4,2) NOT NULL DEFAULT 0.00,
  `max_backlogs`           INT UNSIGNED NOT NULL DEFAULT 0,
  `min_10th_percentage`     DECIMAL(5,2) DEFAULT NULL,
  `min_12th_percentage`     DECIMAL(5,2) DEFAULT NULL,
  `required_skills`        TEXT         DEFAULT NULL COMMENT 'Comma-separated skills',
  `application_start_date` DATETIME     DEFAULT NULL,
  `application_deadline`   DATETIME     DEFAULT NULL,
  `drive_date`             DATETIME     DEFAULT NULL,
  `status`                 ENUM('draft', 'pending_approval', 'approved', 'rejected', 'closed')
                            NOT NULL DEFAULT 'draft',
  `created_at`             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                                        ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_drives_company` (`company_id`),
  KEY `idx_drives_status` (`status`),
  CONSTRAINT `fk_drives_company`
    FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 8. drive_eligible_branches — eligible branches for each drive
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `drive_eligible_branches` (
  `id`       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `drive_id` INT UNSIGNED NOT NULL,
  `branch`   VARCHAR(100) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_drive_branch` (`drive_id`, `branch`),
  CONSTRAINT `fk_drive_branches_drive`
    FOREIGN KEY (`drive_id`) REFERENCES `placement_drives` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 9. applications — student applications for drives
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `applications` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `drive_id`   INT UNSIGNED NOT NULL,
  `student_id` INT UNSIGNED NOT NULL,
  `status`     ENUM('applied', 'shortlisted', 'interview_scheduled', 'selected', 'rejected', 'withdrawn')
               NOT NULL DEFAULT 'applied',
  `applied_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                            ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_application_drive_student` (`drive_id`, `student_id`),
  KEY `idx_applications_student` (`student_id`),
  KEY `idx_applications_status` (`status`),
  CONSTRAINT `fk_applications_drive`
    FOREIGN KEY (`drive_id`) REFERENCES `placement_drives` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_applications_student`
    FOREIGN KEY (`student_id`) REFERENCES `students` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 10. interview_rounds — rounds per drive
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `interview_rounds` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `drive_id`        INT UNSIGNED NOT NULL,
  `round_number`    INT UNSIGNED NOT NULL,
  `round_name`      VARCHAR(100) NOT NULL,
  `scheduled_date`  DATETIME     DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_drive_round_number` (`drive_id`, `round_number`),
  CONSTRAINT `fk_rounds_drive`
    FOREIGN KEY (`drive_id`) REFERENCES `placement_drives` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 11. interview_results — round outcomes for applications
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `interview_results` (
  `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `application_id`   INT UNSIGNED NOT NULL,
  `round_id`         INT UNSIGNED NOT NULL,
  `status`           ENUM('scheduled', 'pass', 'fail', 'absent') NOT NULL DEFAULT 'scheduled',
  `feedback`         TEXT         DEFAULT NULL,
  `interviewer_name` VARCHAR(150) DEFAULT NULL,
  `updated_at`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_application_round` (`application_id`, `round_id`),
  KEY `idx_interview_results_round` (`round_id`),
  CONSTRAINT `fk_interview_results_application`
    FOREIGN KEY (`application_id`) REFERENCES `applications` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_interview_results_round`
    FOREIGN KEY (`round_id`) REFERENCES `interview_rounds` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 12. selections — job offers
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `selections` (
  `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `application_id`   INT UNSIGNED NOT NULL,
  `package_offered`  DECIMAL(10,2) DEFAULT NULL COMMENT 'Annual CTC in LPA',
  `offer_date`       DATE          DEFAULT NULL,
  `status`           ENUM('offered', 'accepted', 'declined') NOT NULL DEFAULT 'offered',
  `created_at`       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                   ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_selections_application` (`application_id`),
  CONSTRAINT `fk_selections_application`
    FOREIGN KEY (`application_id`) REFERENCES `applications` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 13. notifications — in-app notifications
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `notifications` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    INT UNSIGNED NOT NULL,
  `title`      VARCHAR(150) NOT NULL,
  `message`    TEXT         DEFAULT NULL,
  `is_read`    TINYINT(1)   NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notifications_user_unread` (`user_id`, `is_read`),
  CONSTRAINT `fk_notifications_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
