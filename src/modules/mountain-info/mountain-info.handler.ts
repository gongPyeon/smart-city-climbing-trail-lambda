// src/modules/mountain-info/mountain-info.handler.ts

import { createGatewayHandler } from '@/lambda/index';
import { HttpStatus } from '@/common/constants/http-status';
import { getWeatherAlert } from '@/modules/mountain-info/weather/service/weather';
import { getAirQuality } from '@/modules/mountain-info/air-quality/service/air-quality';
import { getSunTimes } from '@/modules/mountain-info/sun-time/service/sun-time';
import { getCoordinatesByTrailName } from '@/utils/coordinates';

interface QueryStringParameters {
  trailName?: string;
}

/**
 * @swagger
 * /mountain-info:
 *   get:
 *     summary: 특정 등산로의 종합 정보 조회
 *     description: 지정된 등산로의 날씨, 대기질, 일출 및 일몰 시간을 제공합니다.
 *     parameters:
 *       - in: query
 *         name: trailName
 *         required: true
 *         schema:
 *           type: string
 *         description: 등산로의 이름.
 *     responses:
 *       200:
 *         description: 등산로 정보를 성공적으로 조회했습니다.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MountainInfoResponse'
 *       400:
 *         description: 잘못된 요청 - 'trailName' 쿼리 파라미터가 누락되었거나 유효하지 않습니다.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: 서버 내부 오류.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 * components:
 *   schemas:
 *     MountainInfoResponse:
 *       type: object
 *       properties:
 *         weather:
 *           $ref: '#/components/schemas/WeatherDTO'
 *         airQuality:
 *           $ref: '#/components/schemas/AirQualityDTO'
 *         sunTimes:
 *           $ref: '#/components/schemas/SunTimeDTO'
 *     WeatherDTO:
 *       type: object
 *       properties:
 *         temperature:
 *           type: number
 *           description: 현재 기온 (섭씨).
 *           example: 5.6
 *         condition:
 *           type: integer
 *           description: "날씨 조건 코드 (예: 0은 강수 없음)."
 *           example: 0
 *         windSpeed:
 *           type: number
 *           description: 풍속 (m/s).
 *           example: 0.2
 *         rainWarning:
 *           type: boolean
 *           description: 비 경고 여부.
 *           example: false
 *         windWarning:
 *           type: boolean
 *           description: 풍속 경고 여부.
 *           example: false
 *     AirQualityDTO:
 *       type: object
 *       properties:
 *         fineDustIndex:
 *           type: integer
 *           description: 미세먼지 지수 (PM10).
 *           example: 32
 *         ultrafineDustIndex:
 *           type: integer
 *           description: 초미세먼지 지수 (PM2.5).
 *           example: 23
 *         fineDustStatus:
 *           type: string
 *           description: 미세먼지 상태.
 *           example: "Good"
 *         ultrafineDustStatus:
 *           type: string
 *           description: 초미세먼지 상태.
 *           example: "Good"
 *     SunTimeDTO:
 *       type: object
 *       properties:
 *         sunrise:
 *           type: string
 *           description: 일출 시간 (현지 시간).
 *           example: "7:26:54 AM"
 *         sunset:
 *           type: string
 *           description: 일몰 시간 (현지 시간).
 *           example: "5:15:33 PM"
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           description: 발생한 오류에 대한 메시지.
 *           example: "Bad Request: 'trailName' query parameter is required."
 */
export const handler = createGatewayHandler(async (req, res) => {
  // query 타입 안전성 확보
  const queryStringParameters = req.query as QueryStringParameters;

  if (!queryStringParameters.trailName) {
    return res({
      status: HttpStatus.BAD_REQUEST,
      body: { message: 'trailName is required.' },
    });
  }

  const { trailName } = queryStringParameters;

  // 위도와 경도 가져오기
  const { lat, lng } = await getCoordinatesByTrailName(trailName);
  // const lat = 37.660934;
  // const lng = 126.993247;

  // 병렬 처리
  const start = Date.now();
  console.log('Before API calls');
  const results = await Promise.allSettled([getWeatherAlert(lat, lng), getAirQuality(lat, lng), getSunTimes(lat, lng)]);
  console.log('Execution times:', Date.now() - start);

  // 디버깅 편의성을 위한 결과 처리
  const response: Record<string, any> = {};
  const errors: Array<string> = [];

  results.forEach((result, index) => {
    const apiName = ['weather', 'airQuality', 'sunTimes'][index];
    if (result.status === 'fulfilled') response[apiName] = result.value;
    // result.status === 'rejected'
    else {
      response[apiName] = null;
      const errorMessage = result.reason instanceof Error ? result.reason.message : String(result.reason);
      errors.push(`${apiName} API Error: ${errorMessage}`);
    }
  });

  if (errors.length > 0) {
    return res({
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { message: 'Errors occurred', errors, data: response },
    });
  }

  return res({
    status: HttpStatus.OK,
    body: response,
  });
});
