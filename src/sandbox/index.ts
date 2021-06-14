import { Time } from '@geeebe/common';
import { logger } from '@geeebe/logging';
import { Graceful, Service } from '@geeebe/service';
import { ApiService } from '../api-service';
import { MonitoringService } from '../monitoring-service';

Graceful.service(
  Time.seconds(1),
  (isReady, isAlive) => Service.combine(
    MonitoringService.create(8081, isReady, isAlive),
    ApiService.create(
      8080,
    ),
  ),
).catch((err) => logger.error(err));
