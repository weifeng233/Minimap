let redraw = false,
	X,
	Z,
	YAW,
	pool;

const createPool = function() {
	if (pool != null) {
		pool.shutdownNow();
	}
	pool = java.util.concurrent.Executors.newScheduledThreadPool(settings.thread);
	pool.setKeepAliveTime(60, java.util.concurrent.TimeUnit.SECONDS);
	pool.allowCoreThreadTimeOut(true);
};

const drawMinimapWhenDirty = function() {
	try {
		if (settings.priority == 0) {
			android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_BACKGROUND);
		} else if (settings.priority == 1) {
			android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_FOREGROUND);
		}
		
		let position = Player.getPosition(),
			yawNew = Entity.getLookAngle(Player.get()).yaw / Math.PI * 180 - 90,
			radius = settings.radius * 16;
		if (position.x != X || position.z != Z || yawNew != YAW || redraw) {
			redraw = false;
			
			let xChunkNew = Math.floor(position.x / 16) * 16,
				zChunkNew = Math.floor(position.z / 16) * 16,
				xChunkOld = Math.floor(X / 16) * 16,
				zChunkOld = Math.floor(Z / 16) * 16;
			if (xChunkNew != xChunkOld || zChunkNew != zChunkOld) {
				if (Math.abs(xChunkNew - xChunkOld) <= radius * 2 && Math.abs(zChunkNew - zChunkOld) <= radius * 2) {
					try {
						bmpSrcLock.acquire();
						bmpSrcCopy.eraseColor(0);
						canvasBmpSrcCopy.drawBitmap(bmpSrc, zChunkNew - zChunkOld, xChunkOld - xChunkNew, null);
						bmpSrc.eraseColor(0);
						canvasBmpSrc.drawBitmap(bmpSrcCopy, 0, 0, null);
					} finally {
						X = position.x;
						Z = position.z;
						bmpSrcLock.release();
					}
					if (xChunkNew > xChunkOld) {
						for (let i = radius + 16 - (xChunkNew - xChunkOld); i <= radius; i += 16) {
							scheduleChunk(xChunkNew + i, zChunkNew, 0);
							for (let ix = 16; ix <= radius; ix += 16) {
								scheduleChunk(xChunkNew + i, zChunkNew + ix, 0);
								scheduleChunk(xChunkNew + i, zChunkNew - ix, 0);
							}
						}
					} else if (xChunkOld > xChunkNew) {
						for (let i = radius + 16 - (xChunkOld - xChunkNew); i <= radius; i += 16) {
							scheduleChunk(xChunkNew - i, zChunkNew, 0);
							for (let ix = 16; ix <= radius; ix += 16) {
								scheduleChunk(xChunkNew - i, zChunkNew + ix, 0);
								scheduleChunk(xChunkNew - i, zChunkNew - ix, 0);
							}
						}
					}
					if (zChunkNew > zChunkOld) {
						for (let i = radius + 16 - (zChunkNew - zChunkOld); i <= radius; i += 16) {
							scheduleChunk(xChunkNew, zChunkNew + i, 0);
							for (let ix = 16; ix <= radius; ix += 16) {
								scheduleChunk(xChunkNew + ix, zChunkNew + i, 0);
								scheduleChunk(xChunkNew - ix, zChunkNew + i, 0);
							}
						}
					} else if (zChunkOld > zChunkNew) {
						for (let i = radius + 16 - (zChunkOld - zChunkNew); i <= radius; i += 16) {
							scheduleChunk(xChunkNew, zChunkNew - i, 0);
							for (let ix = 16; ix <= radius; ix += 16) {
								scheduleChunk(xChunkNew + ix, zChunkNew - i, 0);
								scheduleChunk(xChunkNew - ix, zChunkNew - i, 0);
							}
						}
					}
				} else {
					X = position.x;
					Z = position.z;
					bmpSrc.eraseColor(0);
					scheduleChunk(xChunkNew, zChunkNew, 0);
					for (let i = 16; i <= settings.radius * 16; i += 16) {
						for (let ix = 0; ix < i; ix += 16) {
							scheduleChunk(xChunkNew + ix + 16, zChunkNew + i, 0);
							scheduleChunk(xChunkNew + ix, zChunkNew - i, 0);
							scheduleChunk(xChunkNew - ix, zChunkNew + i, 0);
							scheduleChunk(xChunkNew - ix - 16, zChunkNew - i, 0);
							scheduleChunk(xChunkNew + i, zChunkNew + ix, 0);
							scheduleChunk(xChunkNew + i, zChunkNew - ix - 16, 0);
							scheduleChunk(xChunkNew - i, zChunkNew + ix + 16, 0);
							scheduleChunk(xChunkNew - i, zChunkNew - ix, 0);
						}
					}
				}
			} else {
				X = position.x;
				Z = position.z;
			}
			
			YAW = yawNew;
			let x0 = position.x - (settings.locationSize * 0.5 / absZoom),
				z0 = position.z + (settings.locationSize * 0.5 / absZoom);
			matrixMap.setTranslate(settings.locationSize * 0.5 - (bmpSrc.getWidth() * 0.5) - 8 + position.z - zChunkNew,
				settings.locationSize * 0.5 - (bmpSrc.getHeight() * 0.5) + 8 - position.x + xChunkNew);
			if (settings.mapRotation) {
				matrixMap.postRotate(-YAW, settings.locationSize * 0.5, settings.locationSize * 0.5);
			}
			matrixMap.postScale(absZoom, absZoom, settings.locationSize * 0.5, settings.locationSize * 0.5);
			if (settings.mapLocation) {
				Minimap.updateLocation(position);
			}
			let canvas = mapView.lockCanvas();
			if (canvas == null) {
				redraw = true;
				return;
			}
			canvas.drawColor(0, android.graphics.PorterDuff.Mode.CLEAR);
			canvas.save(android.graphics.Canvas.CLIP_SAVE_FLAG);
			if (bmpBorder != null) {
				canvas.drawBitmap(bmpBorder, 0, 0, null);
			}
			if (android.os.Build.VERSION.SDK_INT >= 28) {
				canvas.clipPath(pathBorder);
			} else {
				canvas.clipPath(pathBorder, android.graphics.Region.Op.REPLACE);
			}
			canvas.drawBitmap(bmpSrc, matrixMap, bmpPaint);
			
			if (settings.indicatorPassive || settings.indicatorHostile || settings.indicatorPlayer) {
				redraw = true;
				for (let i = 0; i < entities.length; i++) {
					let position = Entity.getPosition(entities[i]);
					if (!settings.indicatorOnlySurface || position.y > 60) {
						let id = Entity.getType(entities[i])
						let yaw = settings.stylesheetPointer == 3 ? 0 : Entity.getLookAngle(entities[i]).yaw / Math.PI * 180 - 90
						if (settings.stylesheetPointer != 3) {
							if (ENTITY_PASSIVE.indexOf(id) >= 0 && settings.indicatorPassive) {
								matrixPointer.reset();
								if (pointer[settings.stylesheetPointer].rotate) {
									matrixPointer.postRotate(yaw);
								}
								matrixPointer.postTranslate((z0 - position.z) * absZoom, (position.x - x0) * absZoom);
								if (settings.mapRotation) {
									matrixPointer.postRotate(-YAW, settings.locationSize * 0.5, settings.locationSize * 0.5);
								}
								matrixPointer.preConcat(pointer[settings.stylesheetPointer].matrix);
								canvas.drawBitmap(pointer[settings.stylesheetPointer].bitmap, matrixPointer, pointerPaint.GREEN);
							} else if (ENTITY_HOSTILE.indexOf(id) >= 0 && settings.indicatorHostile) {
								matrixPointer.reset();
								if (pointer[settings.stylesheetPointer].rotate) {
									matrixPointer.postRotate(yaw);
								}
								matrixPointer.postTranslate((z0 - position.z) * absZoom, (position.x - x0) * absZoom);
								if (settings.mapRotation) {
									matrixPointer.postRotate(-YAW, settings.locationSize * 0.5, settings.locationSize * 0.5);
								}
								matrixPointer.preConcat(pointer[settings.stylesheetPointer].matrix);
								canvas.drawBitmap(pointer[settings.stylesheetPointer].bitmap, matrixPointer, pointerPaint.RED);
							} else if (id == 1 && settings.indicatorPlayer) {
								matrixPointer.reset();
								if (pointer[settings.stylesheetPointer].rotate) {
									matrixPointer.postRotate(yaw);
								}
								matrixPointer.postTranslate((z0 - position.z) * absZoom, (position.x - x0) * absZoom);
								if (settings.mapRotation) {
									matrixPointer.postRotate(-YAW, settings.locationSize * 0.5, settings.locationSize * 0.5);
								}
								matrixPointer.preConcat(pointer[settings.stylesheetPointer].matrix);
								canvas.drawBitmap(pointer[settings.stylesheetPointer].bitmap, matrixPointer, null);
							}
						} else if ((ENTITY_PASSIVE.indexOf(id) >= 0 && settings.indicatorPassive) || (ENTITY_HOSTILE.indexOf(id) >= 0 && settings.indicatorHostile) || (id == 1 && settings.indicatorPlayer)) {
							matrixPointer.reset();
							if (!settings.mapRotation) {
								matrixPointer.postRotate(yaw);
							} else {
								matrixPointer.preRotate(YAW);
							}
							matrixPointer.postTranslate((z0 - position.z) * absZoom, (position.x - x0) * absZoom);
							if (settings.mapRotation) {
								matrixPointer.postRotate(-YAW, settings.locationSize * 0.5, settings.locationSize * 0.5);
							}
							matrixPointer.preConcat(getIconMatrix(id) || getIconMatrix(0));
							canvas.drawBitmap(heads[id] || heads[0], matrixPointer, null);
						}
					}
				}
			}
			
			if (settings.indicatorLocal) {
				if (settings.stylesheetPointer != 3) {
					matrixPointer.reset();
					if (!settings.mapRotation && pointer[settings.stylesheetPointer].rotate) {
						matrixPointer.postRotate(yawNew);
					}
					matrixPointer.postTranslate(settings.locationSize * 0.5, settings.locationSize * 0.5);
					matrixPointer.preConcat(pointer[settings.stylesheetPointer].matrix);
					canvas.drawBitmap(pointer[settings.stylesheetPointer].bitmap, matrixPointer, null)
				} else {
					matrixPointer.reset();
					if (!settings.mapRotation) {
						matrixPointer.postRotate(yawNew);
					}
					matrixPointer.postTranslate(settings.locationSize * 0.5, settings.locationSize * 0.5);
					matrixPointer.preConcat(getIconMatrix(63) || getIconMatrix(1) || getIconMatrix(0));
					canvas.drawBitmap(heads[63] || heads[1] || heads[0], matrixPointer, null)
				}
			}
			
			canvas.restore();
			mapView.unlockCanvasAndPost(canvas);
		}
	} catch (e) {
		reportError(e);
	}
};

(function() {
	Minimap.onChangeStylesheet();
	bmpSrc = android.graphics.Bitmap.createBitmap(((settings.radius + 1) * 2 + 1) * 16, ((settings.radius + 1) * 2 + 1) * 16, android.graphics.Bitmap.Config.ARGB_8888);
	bmpSrcCopy = android.graphics.Bitmap.createBitmap(bmpSrc.getWidth(), bmpSrc.getHeight(), android.graphics.Bitmap.Config.ARGB_8888);
	canvasBmpSrc.setBitmap(bmpSrc);
	canvasBmpSrcCopy.setBitmap(bmpSrcCopy);
	minZoom = settings.locationSize / (settings.radius * 2 * 16);
	Minimap.onChangeZoom();
	poolTick = java.util.concurrent.Executors.newSingleThreadScheduledExecutor();
	runnableUpdateMap = new java.lang.Runnable(drawMinimapWhenDirty);
}());
